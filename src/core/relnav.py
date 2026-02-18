def compute_relative_state(primary_state: dict, secondary_state: dict) -> dict:
    """
    Placeholder: Compute relative position/velocity between two satellites.
    Team will implement Hill/CW equations later.
    """
    rel_pos = [
        secondary_state["position"][i] - primary_state["position"][i]
        for i in range(3)
    ]
    rel_vel = [
        secondary_state["velocity"][i] - primary_state["velocity"][i]
        for i in range(3)
    ]
    range_km = sum(x ** 2 for x in rel_pos) ** 0.5

    return {
        "relative_position_km": rel_pos,
        "relative_velocity_km_s": rel_vel,
        "range_km": round(range_km, 3),
        "frame": "ECI_RELATIVE",
        "note": "Placeholder -- Hill frame transformation not yet implemented",
    }
