"""
DISHA Beta — AI Anomaly Monitor (LSTM autoencoder, real model).

Augmentation layer that runs alongside the rule-based FDIR engine.
Rules are the deterministic safety backstop. The AI monitor is the
early-warning and subtle-pattern layer. Both signals feed into the
autonomy manager within the same 1 Hz tick.

Public surface (called from the tick loop in backend/main.py):
    AIMonitor(weights_dir)        # load once at startup
    monitor.update(telemetry)     # append to rolling 60-sample buffer
    result = monitor.evaluate()   # AIMonitorResult — once per tick
    monitor.param_count           # property; logged at boot

Determinism: torch seeds set, model in eval mode, no dropout. The same
input sequence produces the same output across runs — required so the
demo replay is reproducible.

Explainability: every anomaly_score is accompanied by per-feature
z-scores and a list of flagged subsystems. A flag without subsystem
attribution is a bug.
"""

from __future__ import annotations

import json
import math
import pickle
import time
from collections import deque
from pathlib import Path
from typing import List, Optional

import numpy as np
from pydantic import BaseModel, Field

try:
    import torch
    import torch.nn as nn
    _TORCH_OK = True
except Exception:  # pragma: no cover - torch is a hard dep; this is for diag
    torch = None  # type: ignore
    nn = None  # type: ignore
    _TORCH_OK = False

from backend.shared.models.config import get_config


# ─── Field-mapping aliases (mirrored from constraint_engine pattern) ──
# Tolerates telemetry naming drift between MissionState.get_state() and
# the AI monitor without silent failures.
FIELD_MAPPINGS = {
    "battery_soc": ["battery_pct", "battery_soc"],
    "battery_voltage": ["bus_voltage", "battery_voltage"],
    "panel_temp": ["panel_temp_c", "component_temp"],
    "battery_temp": ["battery_temp_c", "battery_temp"],
    "snr": ["snr_db", "snr"],
    "pointing_error": ["pointing_error"],
    "storage_pct": ["storage_pct"],
    # solar_input_power is a computed feature, handled separately
}

# Feature → subsystem map. A subsystem is flagged when ANY of its
# features exceeds the configured z-score threshold. This is the
# explainability surface: every score points to a named subsystem.
FEATURE_TO_SUBSYSTEM = {
    "battery_soc": "POWER",
    "battery_voltage": "POWER",
    "solar_input_power": "POWER",
    "panel_temp": "THERMAL",
    "battery_temp": "THERMAL",
    "snr": "COMMS",
    "pointing_error": "ADCS",
    "storage_pct": "STORAGE",
}


# ─── Public result schema ────────────────────────────────────────────

class FlaggedSubsystem(BaseModel):
    subsystem: str
    features: List[str]  # which features triggered the flag
    max_zscore: float
    per_feature_zscore: dict   # {feature_name: zscore}


class AIMonitorResult(BaseModel):
    anomaly_score: float = 0.0           # 0..1
    flagged_subsystems: List[FlaggedSubsystem] = Field(default_factory=list)
    per_feature_reconstruction_error: dict = Field(default_factory=dict)
    per_feature_zscore: dict = Field(default_factory=dict)
    inference_latency_ms: float = 0.0
    model_confidence: str = "warming_up"  # warming_up | normal | degraded | disabled
    model_loaded: bool = False
    sequence_filled: bool = False
    param_count: int = 0


# ─── Model — matches the trainer's architecture exactly ──────────────

if _TORCH_OK:
    class LSTMAutoencoder(nn.Module):
        """Tiny LSTM autoencoder. Architecture identical to trainer's."""

        def __init__(self, n_features: int, hidden: int = 24,
                     bottleneck: int = 8, seq_len: int = 60):
            super().__init__()
            self.n_features = n_features
            self.hidden = hidden
            self.bottleneck = bottleneck
            self.seq_len = seq_len
            self.encoder = nn.LSTM(
                input_size=n_features, hidden_size=hidden,
                num_layers=1, batch_first=True,
            )
            self.to_bottleneck = nn.Linear(hidden, bottleneck)
            self.from_bottleneck = nn.Linear(bottleneck, hidden)
            self.decoder = nn.LSTM(
                input_size=hidden, hidden_size=hidden,
                num_layers=1, batch_first=True,
            )
            self.output = nn.Linear(hidden, n_features)

        def forward(self, x):
            _, (h_n, _) = self.encoder(x)
            h = h_n.squeeze(0)
            z = self.to_bottleneck(h)
            d = self.from_bottleneck(z)
            d_seq = d.unsqueeze(1).expand(-1, x.size(1), -1)
            out, _ = self.decoder(d_seq)
            return self.output(out)


# ─── Helpers ─────────────────────────────────────────────────────────

def _alias_get(telemetry: dict, param: str, default: float = 0.0) -> float:
    """Telemetry lookup with field-name aliasing. Always returns a float."""
    if param in telemetry and telemetry[param] is not None:
        try:
            return float(telemetry[param])
        except (TypeError, ValueError):
            return default
    for alt in FIELD_MAPPINGS.get(param, []):
        if alt in telemetry and telemetry[alt] is not None:
            try:
                return float(telemetry[alt])
            except (TypeError, ValueError):
                return default
    return default


def _extract_solar_input_power(telemetry: dict) -> float:
    """Solar input power = solar_current * bus_voltage (Watts)."""
    current = _alias_get(telemetry, "solar_panel_current_a")
    if current == 0.0:
        # Try canonical name
        for k in ("solar_panel_current_a", "solar_current"):
            if k in telemetry and telemetry[k] is not None:
                try:
                    current = float(telemetry[k])
                    break
                except (TypeError, ValueError):
                    pass
    voltage = _alias_get(telemetry, "battery_voltage", default=12.0)
    return current * voltage


def _sigmoid_normalize(z: float) -> float:
    """
    Map a max-z-score (typically 0..10+) into [0, 1].

    Design choice — DOCUMENTED IN CODE per spec: we use the *max*
    per-feature z-score (not the mean) to compute the overall anomaly
    score. A single subsystem in distress (z=5 on one feature) should
    not be diluted by seven nominal ones (z=0.3 on the rest). Mean
    would mask the very signal we are trying to surface.

    The mapping is a centered sigmoid with z=2.5 → ~0.5 so that the
    configured zscore_flag_threshold also sits at the half-mark of the
    0..1 score. Steepness 1.5 keeps the score sensitive but bounded.
    """
    return 1.0 / (1.0 + math.exp(-1.5 * (z - 2.5)))


# ─── Inference class ─────────────────────────────────────────────────

class AIMonitor:
    """LSTM-autoencoder anomaly monitor. Loaded once at startup."""

    def __init__(self, weights_dir: str | Path | None = None):
        cfg_all = get_config()
        cfg = cfg_all.get("autonomy", {}).get("ai_monitor", {})

        self.enabled = bool(cfg.get("enabled", True))
        self.sequence_length = int(cfg.get("sequence_length", 60))
        self.zscore_flag_threshold = float(cfg.get("zscore_flag_threshold", 2.5))
        self.warning_threshold = float(cfg.get("anomaly_threshold_warning", 0.4))
        self.critical_threshold = float(cfg.get("anomaly_threshold_critical", 0.7))

        if weights_dir is None:
            weights_dir = cfg.get(
                "weights_path", "backend/fdir/ai_weights"
            )
        self.weights_dir = Path(weights_dir)

        # Initialized empty; populated by _load_weights()
        self.features: List[str] = list(cfg.get("features", []))
        self._mean: Optional[np.ndarray] = None
        self._std: Optional[np.ndarray] = None
        self._err_mean: Optional[np.ndarray] = None
        self._err_std: Optional[np.ndarray] = None
        self._model = None
        self._param_count = 0
        self.model_loaded = False

        # Rolling sequence buffer
        self.buffer: deque = deque(maxlen=self.sequence_length)

        # Last good result (for "degraded" fallback on NaN inputs)
        self._last_good_result: Optional[AIMonitorResult] = None

        # Rolling inference latency (last N evals) — exposed for diagnostics
        self._latency_history: deque = deque(maxlen=256)

        if not self.enabled:
            print("[AI_MONITOR] disabled via config — returning zero scores")
            return

        if not _TORCH_OK:
            print("[AI_MONITOR] torch unavailable — running in disabled mode")
            self.enabled = False
            return

        try:
            self._load_weights()
        except Exception as e:
            # Loading failure must not crash the app — fall back to disabled.
            print(f"[AI_MONITOR] failed to load weights ({e}); disabled")
            self.enabled = False
            self.model_loaded = False

    # ─── Loading & determinism ─────────────────────────────────────

    def _load_weights(self):
        """Load model, scaler, and per-feature calibration from disk."""
        model_path = self.weights_dir / "model.pt"
        scaler_path = self.weights_dir / "scaler.pkl"
        features_path = self.weights_dir / "features.json"

        for p in (model_path, scaler_path, features_path):
            if not p.exists():
                raise FileNotFoundError(f"Missing weight artifact: {p}")

        # Deterministic init
        torch.manual_seed(42)
        np.random.seed(42)

        with open(features_path, "r") as f:
            meta = json.load(f)
        self.features = list(meta["features"])
        self._err_mean = np.asarray(
            meta["calibration"]["feature_error_mean"], dtype=np.float32
        )
        self._err_std = np.asarray(
            meta["calibration"]["feature_error_std"], dtype=np.float32
        )

        with open(scaler_path, "rb") as f:
            scaler = pickle.load(f)
        self._mean = np.asarray(scaler["mean"], dtype=np.float32)
        self._std = np.asarray(scaler["std"], dtype=np.float32)

        ckpt = torch.load(model_path, map_location="cpu", weights_only=True)
        self._model = LSTMAutoencoder(
            n_features=ckpt["n_features"],
            hidden=ckpt["hidden"],
            bottleneck=ckpt["bottleneck"],
            seq_len=ckpt["seq_len"],
        )
        self._model.load_state_dict(ckpt["state_dict"])
        self._model.eval()
        # No dropout / batchnorm in this model, but make the intent explicit
        for p in self._model.parameters():
            p.requires_grad = False

        self._param_count = int(
            ckpt.get("param_count")
            or sum(p.numel() for p in self._model.parameters())
        )
        self.model_loaded = True

        print(
            f"[AI_MONITOR] loaded {model_path.name}  "
            f"features={len(self.features)}  "
            f"param_count={self._param_count}  "
            f"seq_len={self.sequence_length}  "
            f"best_val_loss={ckpt.get('best_val_loss', 'n/a')}"
        )

    @property
    def param_count(self) -> int:
        return self._param_count

    def reset(self):
        self.buffer.clear()
        self._last_good_result = None
        self._latency_history.clear()

    # ─── Feature extraction ────────────────────────────────────────

    def _extract(self, telemetry: dict) -> np.ndarray:
        vals = np.zeros(len(self.features), dtype=np.float32)
        for i, f in enumerate(self.features):
            if f == "solar_input_power":
                vals[i] = _extract_solar_input_power(telemetry)
            else:
                vals[i] = _alias_get(telemetry, f, default=0.0)
        return vals

    # ─── Public API ────────────────────────────────────────────────

    def update(self, telemetry_frame: dict) -> None:
        """Append one telemetry frame to the rolling sequence buffer."""
        if not self.enabled:
            return
        sample = self._extract(telemetry_frame)
        # NaN/inf shielding — keep the last known-good sample rather than
        # crashing the tick loop. The evaluate() call will surface a
        # "degraded" confidence so operators know.
        if not np.isfinite(sample).all():
            if self.buffer:
                sample = self.buffer[-1].copy()
                sample.flags.writeable = True  # ensure new array
            else:
                sample = np.nan_to_num(sample, nan=0.0, posinf=0.0, neginf=0.0)
            self._degraded_next = True
        else:
            self._degraded_next = getattr(self, "_degraded_next", False)
        self.buffer.append(sample)

    def evaluate(self) -> AIMonitorResult:
        """Run one inference pass. Called once per tick after update()."""
        if not self.enabled or not self.model_loaded:
            return AIMonitorResult(
                model_confidence="disabled",
                model_loaded=self.model_loaded,
                sequence_filled=False,
                param_count=self._param_count,
            )

        if len(self.buffer) < self.sequence_length:
            # Cold start — buffer not yet full. Returning zero with
            # "warming_up" confidence prevents false alarms in the
            # first minute, which is when noise dominates the signal.
            return AIMonitorResult(
                model_confidence="warming_up",
                model_loaded=True,
                sequence_filled=False,
                param_count=self._param_count,
            )

        seq = np.stack(self.buffer, axis=0)  # (T, F)
        scaled = (seq - self._mean) / self._std
        x = torch.from_numpy(scaled.astype(np.float32)).unsqueeze(0)  # (1, T, F)

        t0 = time.perf_counter()
        with torch.no_grad():
            recon = self._model(x).squeeze(0).numpy()  # (T, F)
        latency_ms = (time.perf_counter() - t0) * 1000.0
        self._latency_history.append(latency_ms)

        # Per-feature reconstruction error on the most recent timestep.
        # Using the last timestep matches "what is happening right now"
        # — the full-sequence mean would lag a developing anomaly.
        abs_err = np.abs(recon[-1] - scaled[-1])

        # Per-feature z-score against the validation calibration stats
        z = (abs_err - self._err_mean) / self._err_std
        z = np.maximum(z, 0.0)  # negative z (better-than-nominal) is not anomalous

        per_feature_err = {
            f: float(abs_err[i]) for i, f in enumerate(self.features)
        }
        per_feature_z = {
            f: float(z[i]) for i, f in enumerate(self.features)
        }

        # Subsystem attribution. Flag any subsystem whose features
        # have z >= zscore_flag_threshold. Group features by subsystem.
        subsystem_z: dict = {}
        for i, f in enumerate(self.features):
            sub = FEATURE_TO_SUBSYSTEM.get(f, "UNKNOWN")
            subsystem_z.setdefault(sub, {"features": [], "z": []})
            subsystem_z[sub]["features"].append(f)
            subsystem_z[sub]["z"].append(float(z[i]))

        flagged: List[FlaggedSubsystem] = []
        for sub, payload in subsystem_z.items():
            triggers = [
                (f, zv) for f, zv in zip(payload["features"], payload["z"])
                if zv >= self.zscore_flag_threshold
            ]
            if triggers:
                flagged.append(FlaggedSubsystem(
                    subsystem=sub,
                    features=[f for f, _ in triggers],
                    max_zscore=max(zv for _, zv in triggers),
                    per_feature_zscore={f: zv for f, zv in triggers},
                ))

        # Overall score: sigmoid of the MAX z. See _sigmoid_normalize
        # docstring for why max-not-mean.
        max_z = float(z.max())
        score = _sigmoid_normalize(max_z)

        # Confidence: warming_up handled above; degraded if last update()
        # saw NaN/inf input; otherwise normal.
        conf = "degraded" if getattr(self, "_degraded_next", False) else "normal"
        self._degraded_next = False  # consumed

        result = AIMonitorResult(
            anomaly_score=round(score, 4),
            flagged_subsystems=flagged,
            per_feature_reconstruction_error=per_feature_err,
            per_feature_zscore=per_feature_z,
            inference_latency_ms=round(latency_ms, 3),
            model_confidence=conf,
            model_loaded=True,
            sequence_filled=True,
            param_count=self._param_count,
        )
        if conf == "normal":
            self._last_good_result = result
        return result

    # ─── Diagnostics ───────────────────────────────────────────────

    def latency_stats(self) -> dict:
        if not self._latency_history:
            return {"n": 0, "median_ms": 0.0, "p95_ms": 0.0}
        arr = np.asarray(self._latency_history, dtype=np.float64)
        return {
            "n": int(arr.size),
            "median_ms": float(np.median(arr)),
            "p95_ms": float(np.percentile(arr, 95)),
            "max_ms": float(arr.max()),
        }
