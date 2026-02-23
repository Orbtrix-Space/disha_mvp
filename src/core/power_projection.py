"""
Power Projection Module for DISHA MVP.
Projects battery state at key future milestones (next eclipse, end of next orbit).
Uses current telemetry + orbital state to compute projections.
"""

from src.core.power_prediction import predict_eclipse
from src.core.flight_dynamics.propagator import propagate_orbit


# Power budget constants (must match power_prediction.py)
CHARGE_RATE_WH_PER_MIN = 18.0 / 60.0   # 18W solar / 60 = Wh per minute
DISCHARGE_RATE_WH_PER_MIN = 3.0 / 60.0  # 3W idle load / 60 = Wh per minute
BATTERY_CAPACITY_WH = 500.0
WARNING_THRESHOLD_PCT = 25.0


def project_power(mission_state) -> dict:
    """
    Project battery % at next eclipse and end of next orbit.

    Returns:
        {
            "current_battery": float,
            "current_mode": "SUNLIT" | "ECLIPSE",
            "projected_next_eclipse": float,
            "projected_next_orbit": float,
            "time_to_next_eclipse_min": float,
            "power_warning": bool,
            "warning_reason": str | None
        }
    """
    initial_state = {
        "position": mission_state.position.tolist(),
        "velocity": mission_state.velocity.tolist(),
        "epoch": mission_state.current_time,
    }

    # Propagate 100 minutes (slightly more than 1 orbit ~92 min for LEO)
    duration_sec = 6000  # 100 minutes
    step_sec = 30        # 30-second resolution

    trajectory = propagate_orbit(initial_state, duration_sec, step_size=step_sec)

    current_battery_wh = mission_state.current_battery_wh
    battery_pct = round((current_battery_wh / BATTERY_CAPACITY_WH) * 100, 2)

    # Determine current eclipse state
    r_eci_now = mission_state.position.tolist()
    in_eclipse_now = predict_eclipse(r_eci_now)
    current_mode = "ECLIPSE" if in_eclipse_now else "SUNLIT"

    # Walk through trajectory
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
        in_eclipse = predict_eclipse(r_list)

        # Update battery simulation
        step_min = step_sec / 60.0
        if in_eclipse:
            sim_battery_wh = max(0, sim_battery_wh - DISCHARGE_RATE_WH_PER_MIN * step_min)
        else:
            sim_battery_wh = min(BATTERY_CAPACITY_WH,
                                 sim_battery_wh + (CHARGE_RATE_WH_PER_MIN - DISCHARGE_RATE_WH_PER_MIN) * step_min)

        # Detect transition into eclipse (sunlit -> eclipse)
        if not eclipse_transition_found and not prev_eclipse and in_eclipse:
            eclipse_transition_found = True
            projected_at_eclipse = round((sim_battery_wh / BATTERY_CAPACITY_WH) * 100, 2)
            time_to_eclipse_min = round(t_min, 1)

        prev_eclipse = in_eclipse

    # End of orbit projection (last step)
    projected_at_orbit = round((sim_battery_wh / BATTERY_CAPACITY_WH) * 100, 2)

    # If no eclipse transition found within 100min, use current projection
    if projected_at_eclipse is None:
        projected_at_eclipse = projected_at_orbit
        time_to_eclipse_min = 100.0

    # Warning logic
    power_warning = False
    warning_reason = None
    if projected_at_eclipse < WARNING_THRESHOLD_PCT:
        power_warning = True
        warning_reason = f"Battery projected to {projected_at_eclipse}% at next eclipse"
    elif projected_at_orbit < WARNING_THRESHOLD_PCT:
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
