"""
DISHA — MONITOR (NETRA) rolling history.

A thin observer of the tick loop that keeps the last 24 h of
per-second telemetry / FDIR / autonomy state in compact form so the
Analytics view can render the heatmap, anomaly timeline, subsystem
small-multiples, stability trend and state-flow chart without the
backend needing a database.

Memory budget: 86 400 samples × ~12 floats ≈ 4 MB. Acceptable for the
demo; switch to a ring-buffer-backed store later if needed.
"""

from __future__ import annotations

from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Deque, Dict, List, Optional


# 24 h at 1 Hz — every panel reads from this same buffer.
HISTORY_SECONDS = 24 * 3600


class MonitorHistory:
    def __init__(self, max_seconds: int = HISTORY_SECONDS):
        self.max = max_seconds
        # Each sample is a flat dict for cheap downstream slicing.
        self.samples: Deque[dict] = deque(maxlen=max_seconds)
        # Discrete events (rule firings, mode changes) carry their own
        # buffer so the heatmap + anomaly timeline don't have to scan
        # every per-second sample.
        self.events: Deque[dict] = deque(maxlen=2000)

    # ─── Recording (called from the tick loop) ──────────────

    def record(self, *, telemetry: dict, alerts: list, autonomy: dict,
               constraints: dict, ai_result: dict):
        ts = datetime.now(timezone.utc)
        # Per-subsystem health 0–100; 100 = nominal, 0 = critical.
        # We derive these from canonical telemetry channels so the radar
        # chart can read them off without re-computing.
        health = self._derive_health(telemetry, ai_result, constraints)
        self.samples.append({
            "t": ts.isoformat(),
            "risk_score": float(constraints.get("risk_score", 0.0) or 0.0),
            "anomaly_score": float(ai_result.get("anomaly_score", 0.0) or 0.0),
            "stability_index": self._stability_from(constraints, ai_result),
            "mode": autonomy.get("mode") or "AUTONOMOUS",
            "subsystem_health": health,
            "subsystem_values": {
                "battery_pct": _f(telemetry.get("battery_pct")),
                "battery_temp_c": _f(telemetry.get("battery_temp_c")),
                "panel_temp_c": _f(telemetry.get("panel_temp_c")),
                "snr_db": _f(telemetry.get("snr_db")),
                "pointing_error": _f(telemetry.get("pointing_error")),
                "storage_pct": _f(telemetry.get("storage_pct")),
            },
        })

    def record_alert(self, alert: dict, source: str = "rule"):
        self.events.append({
            "t": datetime.now(timezone.utc).isoformat(),
            "kind": "rule_fire" if source == "rule" else source,
            "rule_id": alert.get("rule_id"),
            "subsystem": alert.get("subsystem") or alert.get("component"),
            "severity": alert.get("severity"),
            "message": alert.get("message"),
        })

    def record_mode_change(self, old: str, new: str, reason: str = ""):
        self.events.append({
            "t": datetime.now(timezone.utc).isoformat(),
            "kind": "mode_change",
            "old_mode": old, "new_mode": new, "reason": reason,
        })

    # ─── Queries (consumed by /monitor endpoints) ───────────

    def recent_samples(self, seconds: int) -> List[dict]:
        if not self.samples:
            return []
        if seconds >= len(self.samples):
            return list(self.samples)
        return list(self.samples)[-seconds:]

    def recent_events(self, seconds: int) -> List[dict]:
        if not self.events:
            return []
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=seconds)
        cutoff_iso = cutoff.isoformat()
        return [e for e in self.events if e["t"] >= cutoff_iso]

    def time_in_state(self, seconds: int) -> Dict[str, int]:
        """Seconds spent in each mode across the window."""
        out: Dict[str, int] = {}
        for s in self.recent_samples(seconds):
            m = s["mode"]
            out[m] = out.get(m, 0) + 1
        return out

    def rule_firing_heatmap(self, hours: int = 24, bucket_min: int = 5) -> dict:
        """Count rule firings per rule per `bucket_min`-minute bucket."""
        seconds = hours * 3600
        events = [e for e in self.recent_events(seconds) if e["kind"] == "rule_fire"]
        n_buckets = max(1, (hours * 60) // bucket_min)
        end = datetime.now(timezone.utc)
        start = end - timedelta(seconds=seconds)
        bucket_sec = bucket_min * 60
        rules: Dict[str, List[int]] = {}
        for e in events:
            r = e.get("rule_id") or "(unknown)"
            if r not in rules:
                rules[r] = [0] * n_buckets
            t = datetime.fromisoformat(e["t"])
            idx = int((t - start).total_seconds() / bucket_sec)
            if 0 <= idx < n_buckets:
                rules[r][idx] += 1
        # Bucket labels = the bucket center time
        labels = [
            (start + timedelta(seconds=(i + 0.5) * bucket_sec)).isoformat()
            for i in range(n_buckets)
        ]
        return {
            "bucket_minutes": bucket_min,
            "hours": hours,
            "bucket_labels": labels,
            "rules": [{"rule_id": r, "counts": cnts} for r, cnts in rules.items()],
        }

    # ─── Derivations ────────────────────────────────────────

    def _derive_health(self, t: dict, ai: dict, c: dict) -> Dict[str, float]:
        """Map telemetry → 8 subsystem health values [0..100]."""
        batt = _f(t.get("battery_pct"))           # 0..100 natural
        bt   = _f(t.get("battery_temp_c"))        # 20..40 nominal
        pt   = _f(t.get("panel_temp_c"))
        snr  = _f(t.get("snr_db"))                # >8 nominal
        pe   = _f(t.get("pointing_error"))        # <0.5 nominal
        st   = _f(t.get("storage_pct"))           # <80 nominal
        risk = _f(c.get("risk_score"))            # 0..1
        return {
            "Power":   _norm_high(batt, warn=40, crit=20),
            "Thermal": _band_health(bt, low=0, high=40, warn_lo=10, warn_hi=35, crit_lo=0, crit_hi=45),
            "Comms":   _norm_high(snr, warn=8, crit=5),
            "ADCS":    _norm_low(pe, warn=0.3, crit=0.6, nominal=0.0),
            "Payload": _norm_high(100 - (st or 0), warn=20, crit=10),  # storage headroom
            "EPS":     _norm_high(batt, warn=35, crit=15),
            "Storage": _norm_low(st or 0, warn=70, crit=90, nominal=0.0),
            "Orbit":   _norm_low(risk * 100, warn=30, crit=60, nominal=0.0),
        }

    def _stability_from(self, c: dict, ai: dict) -> float:
        """0..100; higher = more stable. Drops with risk + anomaly."""
        risk = _f(c.get("risk_score"))
        ano  = _f(ai.get("anomaly_score"))
        return round(max(0.0, 100.0 - (risk * 100.0 * 0.6) - (ano * 100.0 * 0.4)), 1)


# ─── Helpers ────────────────────────────────────────────────

def _f(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _norm_high(v: float, warn: float, crit: float, nominal: float = 100.0) -> float:
    """Higher-is-better axis. Maps v=crit→0, v=nominal→100, linear between."""
    if v >= warn:
        return round(80.0 + 20.0 * min(1.0, (v - warn) / max(1e-6, nominal - warn)), 1)
    if v >= crit:
        return round(40.0 + 40.0 * (v - crit) / max(1e-6, warn - crit), 1)
    return round(max(0.0, 40.0 * v / max(1e-6, crit)), 1)


def _norm_low(v: float, warn: float, crit: float, nominal: float = 0.0) -> float:
    """Lower-is-better axis. v=nominal→100, v=crit→0."""
    if v <= warn:
        return round(80.0 + 20.0 * (1.0 - (v - nominal) / max(1e-6, warn - nominal)), 1)
    if v <= crit:
        return round(40.0 + 40.0 * (1.0 - (v - warn) / max(1e-6, crit - warn)), 1)
    return round(max(0.0, 40.0 * (1.0 - (v - crit) / max(1e-6, crit))), 1)


def _band_health(v: float, low: float, high: float,
                 warn_lo: float, warn_hi: float,
                 crit_lo: float, crit_hi: float) -> float:
    """Two-sided band axis (e.g. temp). Returns 100 inside [warn_lo, warn_hi]."""
    if warn_lo <= v <= warn_hi:
        return 100.0
    if crit_lo < v < warn_lo:
        return round(40.0 + 60.0 * (v - crit_lo) / max(1e-6, warn_lo - crit_lo), 1)
    if warn_hi < v < crit_hi:
        return round(40.0 + 60.0 * (crit_hi - v) / max(1e-6, crit_hi - warn_hi), 1)
    return 0.0
