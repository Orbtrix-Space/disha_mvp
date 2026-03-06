"""
DISHA Beta — Power Module
SOC prediction, eclipse modelling, power warnings, task power costing.
Consolidates power_prediction + power_projection.
"""

import numpy as np
from backend.core.flight_dynamics import propagate_orbit, predict_eclipse_simple
from backend.models.constants import EARTH_RADIUS_KM
from backend.models.config import get_config


def _get_power_config():
    config = get_config()
    power_cfg = config.get("power", {})
    return {
        "solar_w": power_cfg.get("solar_array_output_w", 18.0),
        "base_load_w": power_cfg.get("base_load_w", 3.0),
        "battery_wh": power_cfg.get("battery_capacity_wh", 500.0),
        "task_loads": power_cfg.get("task_loads_w", {
            "IMAGING": 8.0, "DOWNLINK": 12.0, "MANOEUVRE": 6.0, "CONTACT": 10.0
        }),
    }


# Data rates per minute (GB) for storage prediction
TASK_DATA_RATE_GB_MIN = {
    "IMAGING": 0.4,
    "DOWNLINK": -1.5,
    "MANOEUVRE": 0.0,
    "CONTACT": 0.0,
}

DEFAULT_TASK_DURATION_MIN = {
    "IMAGING": 5,
    "DOWNLINK": 8,
    "MANOEUVRE": 3,
    "CONTACT": 10,
}


def predict_power(mission_state, duration_minutes: int = 90, step_minutes: int = 1,
                  scheduled_tasks: list = None) -> dict:
    """
    90-minute SOC prediction curve with eclipse model.
    Takes current state + orbit prediction → steps through eclipse/sunlit transitions.

    Returns dict with prediction_points, storage_prediction_points, min_soc_pct, etc.
    """
    pcfg = _get_power_config()
    solar_w = pcfg["solar_w"]
    base_load_w = pcfg["base_load_w"]
    battery_capacity_wh = pcfg["battery_wh"]
    task_loads = pcfg["task_loads"]

    initial_state = {
        "position": mission_state.position.tolist() if hasattr(mission_state.position, 'tolist') else list(mission_state.position),
        "velocity": mission_state.velocity.tolist() if hasattr(mission_state.velocity, 'tolist') else list(mission_state.velocity),
        "epoch": mission_state.current_time,
    }

    duration_sec = duration_minutes * 60
    step_sec = step_minutes * 60
    trajectory = propagate_orbit(initial_state, duration_sec, step_size=step_sec)

    # Build task load/data maps
    task_load_map = {}
    task_data_map = {}
    if scheduled_tasks:
        for task in scheduled_tasks:
            action = task.get("action", "IMAGING")
            start = int(task.get("start_min", 0))
            dur = int(task.get("duration_min", DEFAULT_TASK_DURATION_MIN.get(action, 5)))
            extra_w = task_loads.get(action, 5.0)
            data_rate = TASK_DATA_RATE_GB_MIN.get(action, 0.0)
            for m in range(start, min(start + dur, duration_minutes)):
                task_load_map[m] = task_load_map.get(m, 0) + extra_w
                task_data_map[m] = task_data_map.get(m, 0) + data_rate

    current_soc_wh = mission_state.current_battery_wh
    current_storage_gb = getattr(mission_state, 'current_storage_used_gb', 0.0)
    max_storage_gb = getattr(mission_state, 'MAX_STORAGE_GB', 1024.0)
    predictions = []
    storage_predictions = []
    min_soc = current_soc_wh

    for step in trajectory:
        t_offset = step["time_offset"]
        t_min = round(t_offset / 60.0, 1)
        t_min_int = int(t_min)
        r_eci = step["eci_state"][:3]
        r_list = r_eci.tolist() if hasattr(r_eci, 'tolist') else list(r_eci)

        in_eclipse = predict_eclipse_simple(r_list)
        solar_gen = 0.0 if in_eclipse else solar_w
        task_extra_w = task_load_map.get(t_min_int, 0)
        load_w = base_load_w + task_extra_w

        net_power = solar_gen - load_w
        hours = step_sec / 3600.0
        current_soc_wh = max(0, min(battery_capacity_wh, current_soc_wh + net_power * hours))
        soc_pct = round((current_soc_wh / battery_capacity_wh) * 100, 2)
        min_soc = min(min_soc, current_soc_wh)

        data_delta_gb = task_data_map.get(t_min_int, 0) * step_minutes
        current_storage_gb = max(0, min(max_storage_gb, current_storage_gb + data_delta_gb))
        storage_pct = round((current_storage_gb / max_storage_gb) * 100, 2)

        predictions.append({
            "time_offset_min": t_min,
            "soc_pct": soc_pct,
            "in_eclipse": in_eclipse,
            "solar_generation_w": round(solar_gen, 1),
            "load_consumption_w": round(load_w, 1),
            "task_load_w": round(task_extra_w, 1),
        })

        storage_predictions.append({
            "time_offset_min": t_min,
            "storage_used_gb": round(current_storage_gb, 2),
            "storage_pct": storage_pct,
            "delta_gb": round(data_delta_gb, 3),
        })

    min_soc_pct = round((min_soc / battery_capacity_wh) * 100, 2)

    return {
        "prediction_points": predictions,
        "storage_prediction_points": storage_predictions,
        "min_soc_pct": min_soc_pct,
        "power_margin_wh": round(min_soc, 2),
        "max_storage_gb": max_storage_gb,
        "has_scheduled_tasks": bool(scheduled_tasks),
    }


def project_power(mission_state) -> dict:
    """
    Project battery % at next eclipse and end of next orbit.
    Returns milestone projections + warnings.
    """
    pcfg = _get_power_config()
    charge_rate = pcfg["solar_w"] / 60.0
    discharge_rate = pcfg["base_load_w"] / 60.0
    battery_capacity_wh = pcfg["battery_wh"]

    initial_state = {
        "position": mission_state.position.tolist() if hasattr(mission_state.position, 'tolist') else list(mission_state.position),
        "velocity": mission_state.velocity.tolist() if hasattr(mission_state.velocity, 'tolist') else list(mission_state.velocity),
        "epoch": mission_state.current_time,
    }

    duration_sec = 6000  # 100 minutes
    step_sec = 30
    trajectory = propagate_orbit(initial_state, duration_sec, step_size=step_sec)

    current_battery_wh = mission_state.current_battery_wh
    battery_pct = round((current_battery_wh / battery_capacity_wh) * 100, 2)

    r_eci_now = mission_state.position.tolist() if hasattr(mission_state.position, 'tolist') else list(mission_state.position)
    in_eclipse_now = predict_eclipse_simple(r_eci_now)
    current_mode = "ECLIPSE" if in_eclipse_now else "SUNLIT"

    sim_battery_wh = current_battery_wh
    prev_eclipse = in_eclipse_now
    eclipse_transition_found = False
    projected_at_eclipse = None
    time_to_eclipse_min = None

    for step in trajectory:
        t_offset = step["time_offset"]
        t_min = t_offset / 60.0
        r_eci = step["eci_state"][:3]
        r_list = r_eci.tolist() if hasattr(r_eci, 'tolist') else list(r_eci)
        in_eclipse = predict_eclipse_simple(r_list)

        step_min = step_sec / 60.0
        if in_eclipse:
            sim_battery_wh = max(0, sim_battery_wh - discharge_rate * step_min)
        else:
            sim_battery_wh = min(battery_capacity_wh,
                                 sim_battery_wh + (charge_rate - discharge_rate) * step_min)

        if not eclipse_transition_found and not prev_eclipse and in_eclipse:
            eclipse_transition_found = True
            projected_at_eclipse = round((sim_battery_wh / battery_capacity_wh) * 100, 2)
            time_to_eclipse_min = round(t_min, 1)

        prev_eclipse = in_eclipse

    projected_at_orbit = round((sim_battery_wh / battery_capacity_wh) * 100, 2)

    if projected_at_eclipse is None:
        projected_at_eclipse = projected_at_orbit
        time_to_eclipse_min = 100.0

    power_warning = False
    warning_reason = None
    warning_threshold = 25.0
    if projected_at_eclipse < warning_threshold:
        power_warning = True
        warning_reason = f"Battery projected to {projected_at_eclipse}% at next eclipse"
    elif projected_at_orbit < warning_threshold:
        power_warning = True
        warning_reason = f"Battery projected to {projected_at_orbit}% at end of orbit"

    return {
        "current_battery": battery_pct,
        "current_mode": current_mode,
        "projected_next_eclipse": projected_at_eclipse,
        "projected_next_orbit": projected_at_orbit,
        "time_to_next_eclipse_min": time_to_eclipse_min,
        "power_warning": power_warning,
        "warning_reason": warning_reason,
    }


def check_power_feasibility(current_battery_wh: float, task_power_draw_w: float,
                             task_duration_s: float, battery_capacity_wh: float = 500.0,
                             warning_threshold_pct: float = 20.0) -> dict:
    """
    Check if a task can execute without SOC dropping below warning threshold.
    Used by scheduler for power costing.
    """
    task_cost_wh = task_power_draw_w * (task_duration_s / 3600.0)
    battery_after = current_battery_wh - task_cost_wh
    battery_after_pct = (battery_after / battery_capacity_wh) * 100

    return {
        "feasible": battery_after_pct >= warning_threshold_pct,
        "battery_after_pct": round(battery_after_pct, 2),
        "task_cost_wh": round(task_cost_wh, 2),
    }
