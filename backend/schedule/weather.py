"""
Deterministic per-AOI weather mock.

Same (target_id, day) → same cloud %. No real meteorology — the goal
is that the scheduler's "weather rejected this pass" outcome is stable
across reloads so demos are repeatable.

We hash the inputs into [0, 1] and fold a per-AOI bias on top so that
a given AOI tends to be cloudier than others (mimics real climate
gradients without modelling them).
"""

from __future__ import annotations

import hashlib
from datetime import datetime


def _h(*parts: str) -> float:
    """Stable [0, 1) hash from string parts."""
    h = hashlib.sha256("|".join(parts).encode("utf-8")).digest()
    return int.from_bytes(h[:6], "big") / (1 << 48)


def cloud_cover_pct(target_id: str, when: datetime, aoi_seed: str = "") -> float:
    """Return cloud cover in %, deterministic for the given inputs."""
    day_key = when.strftime("%Y-%m-%d")
    # Base "weather of the day" (regional climate effect, slowly varying)
    base = _h("base", aoi_seed or target_id, day_key)
    # Diurnal jitter (within-day variation, smaller magnitude)
    jitter = _h("jit", target_id, when.strftime("%Y-%m-%d-%H"))
    val = 0.65 * base + 0.35 * jitter
    # Skew so a meaningful subset of AOIs is clear (<40%) and a tail is bad.
    skewed = val ** 1.3
    return round(skewed * 100.0, 1)
