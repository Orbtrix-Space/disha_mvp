"""
Power Prediction Module for DISHA MVP.
Predicts future battery SOC based on orbital eclipse/sunlit periods,
spacecraft load consumption, and scheduled task loads.
Also predicts storage usage from imaging/downlink tasks.
"""

import numpy as np
from src.core.flight_dynamics.propagator import propagate_orbit
from src.utils.constants import EARTH_RADIUS_KM

# Power budget constants (typical LEO CubeSat)
SOLAR_PANEL_GENERATION_W = 18.0
IDLE_LOAD_W = 3.0
BATTERY_CAPACITY_WH = 500.0

# Task load profiles (additional watts during active tasks)
TASK_LOAD_W = {
    "IMAGING": 8.0,      # Camera sensor + onboard processing
    "DOWNLINK": 12.0,    # High-gain TX amplifier
}

# Data rates per minute (GB) for storage prediction
TASK_DATA_RATE_GB_MIN = {
    "IMAGING": 0.4,      # 0.4 GB/min captured
    "DOWNLINK": -1.5,    # 1.5 GB/min transmitted to ground
}

DEFAULT_TASK_DURATION_MIN = {
    "IMAGING": 5,
    "DOWNLINK": 8,
}


def predict_eclipse(position_eci) -> bool:
    """
    Simplified eclipse check using cylindrical shadow model.
    Sun direction approximated as +X axis for MVP.
    """
    sun_direction = np.array([1.0, 0.0, 0.0])
    r = np.array(position_eci, dtype=float)

    # Project satellite position onto sun direction
    sun_dot = np.dot(r, sun_direction)

    # If satellite is on the dark side of Earth
    if sun_dot < 0:
        perp_distance = np.linalg.norm(r - sun_dot * sun_direction)
        if perp_distance < EARTH_RADIUS_KM:
            return True

    return False


def predict_power(mission_state, duration_minutes: int = 90, step_minutes: int = 1,
                  scheduled_tasks: list = None) -> dict:
    """
    Predict future battery SOC and storage usage over the given duration.

    scheduled_tasks: list of {action: str, start_min: float, duration_min: float}

    Returns dict with:
    - prediction_points: list of power + storage data per timestep
    - min_soc_pct, power_margin_wh
    - storage_prediction_points: list of {time_offset_min, storage_used_gb, storage_pct, delta_gb}
    """
    initial_state = {
        "position": mission_state.position.tolist(),
        "velocity": mission_state.velocity.tolist(),
        "epoch": mission_state.current_time,
    }

    duration_sec = duration_minutes * 60
    step_sec = step_minutes * 60

    trajectory = propagate_orbit(initial_state, duration_sec, step_size=step_sec)

    # Build minute-by-minute task load and data maps
    task_load_map = {}   # minute -> extra watts
    task_data_map = {}   # minute -> GB change per minute

    if scheduled_tasks:
        for task in scheduled_tasks:
            action = task.get("action", "IMAGING")
            start = int(task.get("start_min", 0))
            dur = int(task.get("duration_min", DEFAULT_TASK_DURATION_MIN.get(action, 5)))
            extra_w = TASK_LOAD_W.get(action, 5.0)
            data_rate = TASK_DATA_RATE_GB_MIN.get(action, 0.0)

            for m in range(start, min(start + dur, duration_minutes)):
                task_load_map[m] = task_load_map.get(m, 0) + extra_w
                task_data_map[m] = task_data_map.get(m, 0) + data_rate

    current_soc_wh = mission_state.current_battery_wh
    current_storage_gb = mission_state.current_storage_used_gb
    max_storage_gb = mission_state.MAX_STORAGE_GB
    predictions = []
    storage_predictions = []
    min_soc = current_soc_wh

    for step in trajectory:
        t_offset = step["time_offset"]
        t_min = round(t_offset / 60.0, 1)
        t_min_int = int(t_min)
        r_eci = step["eci_state"][:3]

        in_eclipse = predict_eclipse(r_eci.tolist() if hasattr(r_eci, 'tolist') else list(r_eci))

        solar_w = 0.0 if in_eclipse else SOLAR_PANEL_GENERATION_W
        task_extra_w = task_load_map.get(t_min_int, 0)
        load_w = IDLE_LOAD_W + task_extra_w

        # Net power (positive = charging, negative = discharging)
        net_power_w = solar_w - load_w
        hours = step_sec / 3600.0
        current_soc_wh = max(0, min(BATTERY_CAPACITY_WH, current_soc_wh + net_power_w * hours))

        soc_pct = round((current_soc_wh / BATTERY_CAPACITY_WH) * 100, 2)
        min_soc = min(min_soc, current_soc_wh)

        # Storage change from tasks
        data_delta_gb = task_data_map.get(t_min_int, 0) * step_minutes
        current_storage_gb = max(0, min(max_storage_gb, current_storage_gb + data_delta_gb))
        storage_pct = round((current_storage_gb / max_storage_gb) * 100, 2)

        predictions.append({
            "time_offset_min": t_min,
            "soc_pct": soc_pct,
            "in_eclipse": in_eclipse,
            "solar_generation_w": round(solar_w, 1),
            "load_consumption_w": round(load_w, 1),
            "task_load_w": round(task_extra_w, 1),
        })

        storage_predictions.append({
            "time_offset_min": t_min,
            "storage_used_gb": round(current_storage_gb, 2),
            "storage_pct": storage_pct,
            "delta_gb": round(data_delta_gb, 3),
        })

    min_soc_pct = round((min_soc / BATTERY_CAPACITY_WH) * 100, 2)

    return {
        "prediction_points": predictions,
        "storage_prediction_points": storage_predictions,
        "min_soc_pct": min_soc_pct,
        "power_margin_wh": round(min_soc, 2),
        "max_storage_gb": max_storage_gb,
        "has_scheduled_tasks": bool(scheduled_tasks),
    }
