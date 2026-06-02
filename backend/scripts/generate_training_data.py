"""
DISHA Beta — Headless Training Data Generator

Drives the existing MissionState simulator offline (no FastAPI, no
WebSocket) for a configurable number of orbital scenarios and ticks.
Collects per-tick telemetry on the 8 features the AI monitor watches
and writes it to training_data/ as a single .npz file.

The dataset is the contract between this script and
train_anomaly_model.py — feature order is fixed and recorded in
the .npz file alongside the array.

Usage:
    PYTHONPATH=. python backend/scripts/generate_training_data.py
    PYTHONPATH=. python backend/scripts/generate_training_data.py --hours 24 --runs 3

Diversity: each run varies starting battery SOC (60/75/95%),
component temperature, and uses a different initial orbit
(equatorial-LEO, polar-LEO, mid-inclination-LEO) so the model
sees varied eclipse cycles and thermal profiles.

Out of scope: live TLE fetch. We use synthetic orbits to keep this
script offline-friendly and deterministic.
"""

from __future__ import annotations

import argparse
import math
import os
import random
import sys
import time
from pathlib import Path

import numpy as np

# Make `backend.*` importable when called as a script
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.shared.models.config import load_config  # noqa: E402
from backend.shared.state.mission_state import MissionState  # noqa: E402

# Feature list — keep aligned with config/satellite_config.json
# autonomy.ai_monitor.features. The order written here is the order
# the model trains on and the order inference expects.
FEATURES = [
    "battery_soc",
    "battery_voltage",
    "panel_temp",
    "battery_temp",
    "snr",
    "pointing_error",
    "storage_pct",
    "solar_input_power",
]

MU_EARTH = 398600.4418  # km^3 / s^2 — for circular-orbit velocity


def circular_orbit_state(altitude_km: float, inclination_deg: float):
    """Return (pos_eci_km, vel_eci_km_s) for a circular orbit."""
    a = 6378.137 + altitude_km
    speed = math.sqrt(MU_EARTH / a)
    i = math.radians(inclination_deg)
    # ascending-node aligned: r = [a, 0, 0], v in y-z plane
    return (
        np.array([a, 0.0, 0.0]),
        np.array([0.0, speed * math.cos(i), speed * math.sin(i)]),
    )


# Three diverse synthetic orbits — proxy for "three different TLE
# inputs for orbital diversity" without needing internet.
SCENARIOS = [
    {
        "name": "equatorial_400km",
        "altitude_km": 400.0,
        "inclination_deg": 0.0,
        "initial_soc_pct": 95.0,
        "initial_panel_temp_c": 22.0,
        "seed": 42,
    },
    {
        "name": "polar_700km",
        "altitude_km": 700.0,
        "inclination_deg": 90.0,
        "initial_soc_pct": 75.0,
        "initial_panel_temp_c": 18.0,
        "seed": 1337,
    },
    {
        "name": "mid_incl_550km",
        "altitude_km": 550.0,
        "inclination_deg": 51.6,
        "initial_soc_pct": 60.0,
        "initial_panel_temp_c": 27.0,
        "seed": 2024,
    },
]


def extract_features(state: dict) -> list[float]:
    """
    Pull the 8 monitored features out of a get_state() snapshot.
    Uses field-mapping fallbacks so naming drift in get_state() does
    not silently break the training set.
    """
    def g(*keys, default=0.0):
        for k in keys:
            if k in state and state[k] is not None:
                return float(state[k])
        return float(default)

    return [
        g("battery_soc", "battery_pct", default=100.0),
        g("bus_voltage", "battery_voltage", default=12.0),
        g("panel_temp_c", "component_temp", default=25.0),
        g("battery_temp_c", "battery_temp", default=22.0),
        g("snr_db", "snr", default=15.0),
        g("pointing_error", default=0.1),
        g("storage_pct", default=0.0),
        # Solar input power = current * voltage. The simulator exposes
        # solar_panel_current_a and bus_voltage; both can vary tick to
        # tick (sunlit vs eclipse, voltage noise).
        g("solar_panel_current_a", "solar_current", default=1.5)
        * g("bus_voltage", default=12.0),
    ]


def run_scenario(scenario: dict, hours: float) -> np.ndarray:
    """Run one headless simulation, return an (N, 8) feature matrix."""
    random.seed(scenario["seed"])
    np.random.seed(scenario["seed"])

    sat = MissionState()
    # Override initial conditions for this scenario
    pos, vel = circular_orbit_state(
        scenario["altitude_km"], scenario["inclination_deg"]
    )
    sat.position = pos
    sat.velocity = vel
    sat.current_battery_wh = (
        sat.battery_capacity_wh * scenario["initial_soc_pct"] / 100.0
    )
    sat.component_temp = scenario["initial_panel_temp_c"]
    sat.panel_temp_c = scenario["initial_panel_temp_c"]

    ticks = int(hours * 3600)
    out = np.zeros((ticks, len(FEATURES)), dtype=np.float32)

    # Simulate ground contact at ~25% duty cycle so SNR is non-zero
    # for a representative fraction of samples (otherwise the COMMS
    # feature collapses to a single value during long blackouts).
    contact_period = 5400  # 90 min orbit-ish
    contact_window = int(0.25 * contact_period)

    t0 = time.perf_counter()
    for i in range(ticks):
        # Synthetic ground-contact toggling
        phase = i % contact_period
        in_contact = phase < contact_window
        if in_contact:
            elev = 20.0 + 40.0 * math.sin(math.pi * phase / contact_window)
            sat.update_contact(True, "SIM_GROUND", elev)
        else:
            sat.update_contact(False, None, 0.0)

        sat.tick(1.0)
        out[i, :] = extract_features(sat.get_state())

    elapsed = time.perf_counter() - t0
    rate = ticks / elapsed if elapsed > 0 else float("inf")
    print(
        f"  [{scenario['name']}] {ticks} ticks in {elapsed:.1f}s "
        f"({rate:.0f} ticks/s)"
    )
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--hours", type=float, default=12.0,
        help="Sim hours per scenario (default 12 → ~130K total samples)",
    )
    parser.add_argument(
        "--runs", type=int, default=len(SCENARIOS),
        help="Number of scenarios to run (max 3)",
    )
    parser.add_argument(
        "--out", type=str,
        default="training_data/nominal_telemetry.npz",
        help="Output .npz path (relative to repo root)",
    )
    args = parser.parse_args()

    load_config()

    out_path = ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)

    scenarios = SCENARIOS[: args.runs]
    print(
        f"Generating {len(scenarios)} scenario(s) "
        f"x {args.hours} h = ~{int(len(scenarios)*args.hours*3600)} samples"
    )

    chunks = []
    for sc in scenarios:
        chunks.append(run_scenario(sc, args.hours))

    data = np.concatenate(chunks, axis=0)

    # Drop NaN / inf rows so the trainer doesn't see them.
    finite_mask = np.isfinite(data).all(axis=1)
    dropped = int((~finite_mask).sum())
    if dropped:
        print(f"  Dropped {dropped} non-finite rows")
    data = data[finite_mask]

    # Save
    np.savez_compressed(
        out_path,
        data=data,
        features=np.array(FEATURES),
    )

    # Report
    print(f"\nSaved: {out_path}")
    print(f"Total samples: {data.shape[0]}  features: {data.shape[1]}")
    print("\nFeature ranges (min / mean / max / std):")
    print(f"{'feature':<20} {'min':>10} {'mean':>10} {'max':>10} {'std':>10}")
    for i, f in enumerate(FEATURES):
        col = data[:, i]
        print(
            f"{f:<20} {col.min():>10.3f} {col.mean():>10.3f} "
            f"{col.max():>10.3f} {col.std():>10.3f}"
        )


if __name__ == "__main__":
    main()
