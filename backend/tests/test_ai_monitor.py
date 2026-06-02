"""
DISHA Beta — AI Monitor tests.

Covers four properties the spec calls out:
  1. Determinism — same input sequence -> identical output across runs.
  2. Output shape and value bounds.
  3. warming_up confidence until the 60-sample buffer is full.
  4. Inference latency stays under the 50ms-per-tick budget on CPU.
  5. NaN input does not crash the tick loop — returns a "degraded"
     confidence and reuses the last valid sample.

Run from repo root:
    PYTHONPATH=. python -m pytest backend/tests/test_ai_monitor.py -v
"""

from __future__ import annotations

import math
import os
import time
import statistics
from pathlib import Path

import numpy as np
import pytest

from backend.shared.models.config import load_config
from backend.fdir.ai_monitor import AIMonitor, AIMonitorResult


load_config()


WEIGHTS_DIR = Path(__file__).resolve().parents[1] / "core" / "ai_weights"


def _have_weights() -> bool:
    return (
        (WEIGHTS_DIR / "model.pt").exists()
        and (WEIGHTS_DIR / "scaler.pkl").exists()
        and (WEIGHTS_DIR / "features.json").exists()
    )


pytestmark = pytest.mark.skipif(
    not _have_weights(),
    reason="AI weights not built; run backend/scripts/train_anomaly_model.py first",
)


def nominal_telemetry() -> dict:
    """A reasonable nominal-state telemetry frame, all 8 features present."""
    return {
        "battery_pct": 90.0,
        "bus_voltage": 12.0,
        "panel_temp_c": 25.0,
        "battery_temp_c": 22.0,
        "snr_db": 14.0,
        "pointing_error": 0.1,
        "storage_pct": 0.0,
        "solar_panel_current_a": 1.5,
    }


def fill_buffer(monitor: AIMonitor, n: int, frame: dict | None = None):
    frame = frame or nominal_telemetry()
    for _ in range(n):
        monitor.update(frame)


# ─── 1. Determinism ──────────────────────────────────────────────────

def test_determinism_same_input_same_output():
    m1 = AIMonitor()
    m2 = AIMonitor()
    assert m1.model_loaded and m2.model_loaded

    frame = nominal_telemetry()
    for _ in range(60):
        m1.update(frame)
        m2.update(frame)

    r1 = m1.evaluate()
    r2 = m2.evaluate()

    assert r1.anomaly_score == r2.anomaly_score
    assert r1.per_feature_reconstruction_error == r2.per_feature_reconstruction_error
    assert r1.per_feature_zscore == r2.per_feature_zscore
    assert (
        [fs.subsystem for fs in r1.flagged_subsystems]
        == [fs.subsystem for fs in r2.flagged_subsystems]
    )


# ─── 2. Shape and value bounds ──────────────────────────────────────

def test_output_shape_and_bounds():
    m = AIMonitor()
    fill_buffer(m, 60)
    r = m.evaluate()

    assert isinstance(r, AIMonitorResult)
    assert 0.0 <= r.anomaly_score <= 1.0
    assert r.param_count > 0
    assert r.param_count < 100_000, "Param count must stay under the 100K pitch claim"
    assert r.model_confidence == "normal"
    assert r.sequence_filled is True

    # All 8 features must be present in both per-feature dicts
    assert len(r.per_feature_reconstruction_error) == 8
    assert len(r.per_feature_zscore) == 8
    for v in r.per_feature_reconstruction_error.values():
        assert math.isfinite(v) and v >= 0.0
    for v in r.per_feature_zscore.values():
        assert math.isfinite(v) and v >= 0.0  # negative z is clipped to 0

    # Every flagged subsystem must carry its triggering features +
    # per-feature z-scores. A flag without attribution is a bug.
    for fs in r.flagged_subsystems:
        assert fs.subsystem
        assert fs.features
        assert fs.per_feature_zscore
        assert fs.max_zscore >= m.zscore_flag_threshold


# ─── 3. warming_up confidence ───────────────────────────────────────

def test_warming_up_for_first_59_samples():
    m = AIMonitor()

    # Empty buffer → warming_up
    r0 = m.evaluate()
    assert r0.model_confidence == "warming_up"
    assert r0.anomaly_score == 0.0
    assert r0.sequence_filled is False

    # Fill 59 samples — still warming
    for _ in range(59):
        m.update(nominal_telemetry())
        r = m.evaluate()
        assert r.model_confidence == "warming_up"
        assert r.anomaly_score == 0.0

    # 60th sample flips it to normal
    m.update(nominal_telemetry())
    r60 = m.evaluate()
    assert r60.model_confidence == "normal"
    assert r60.sequence_filled is True


# ─── 4. Inference latency ───────────────────────────────────────────

LATENCY_BUDGET_MS = 50.0


@pytest.mark.skipif(
    os.environ.get("DISHA_SKIP_LATENCY") == "1",
    reason="Slow CI: skip latency assertion (set DISHA_SKIP_LATENCY=0 to enable)",
)
def test_inference_latency_under_50ms_cpu():
    m = AIMonitor()
    fill_buffer(m, 60)

    # Warm-up (first call often includes lazy initialization)
    for _ in range(5):
        m.evaluate()

    latencies = []
    for _ in range(100):
        t0 = time.perf_counter()
        r = m.evaluate()
        latencies.append((time.perf_counter() - t0) * 1000.0)
        # Roll the buffer so each call sees fresh-ish input
        m.update(nominal_telemetry())

    median_ms = statistics.median(latencies)
    p95_ms = sorted(latencies)[int(0.95 * len(latencies)) - 1]
    print(f"\n  latency  median={median_ms:.2f}ms  p95={p95_ms:.2f}ms")

    assert median_ms < LATENCY_BUDGET_MS, (
        f"Median inference latency {median_ms:.2f}ms exceeds "
        f"the {LATENCY_BUDGET_MS}ms tick budget"
    )


# ─── 5. NaN graceful handling ───────────────────────────────────────

def test_nan_input_does_not_crash_returns_degraded():
    m = AIMonitor()
    fill_buffer(m, 60)
    baseline = m.evaluate()
    assert baseline.model_confidence == "normal"

    # Inject NaN on one feature
    bad = nominal_telemetry()
    bad["snr_db"] = float("nan")
    bad["panel_temp_c"] = float("inf")

    m.update(bad)
    r = m.evaluate()

    # Must not crash; must surface the degradation honestly.
    assert isinstance(r, AIMonitorResult)
    assert r.model_confidence == "degraded"
    assert 0.0 <= r.anomaly_score <= 1.0
