"""
Constraint Engine for DISHA MVP.
Rule-based constraint evaluation with weighted risk scoring.
Accepts a telemetry snapshot and returns active constraints + risk score.
"""


# Constraint rules: (field, operator, threshold, severity, weight, type_label, message)
CONSTRAINT_RULES = [
    ("battery_pct", "<", 25, "CRITICAL", 0.35, "POWER", "Battery below 25%"),
    ("battery_pct", "<", 40, "WARNING", 0.15, "POWER", "Battery below 40%"),
    ("storage_pct", ">", 90, "WARNING", 0.12, "STORAGE", "Storage above 90%"),
    ("storage_pct", ">", 95, "CRITICAL", 0.25, "STORAGE", "Storage above 95%"),
    ("link_status", "!=", "NOMINAL", "CRITICAL", 0.30, "COMMS", "Link degraded"),
    ("panel_temp_c", ">", 75, "WARNING", 0.10, "THERMAL", "Panel temp high"),
    ("panel_temp_c", "<", -30, "WARNING", 0.10, "THERMAL", "Panel temp low"),
    ("battery_temp_c", ">", 40, "WARNING", 0.10, "THERMAL", "Battery temp high"),
    ("battery_temp_c", "<", 5, "WARNING", 0.08, "THERMAL", "Battery temp low"),
    ("snr_db", "<", 8, "WARNING", 0.10, "COMMS", "SNR degraded"),
    ("snr_db", "<", 5, "CRITICAL", 0.20, "COMMS", "SNR critically low"),
    ("altitude_km", "<", 250, "CRITICAL", 0.30, "ORBIT", "Altitude dangerously low"),
]


def evaluate_constraints(telemetry_snapshot: dict) -> dict:
    """
    Evaluate all constraint rules against a telemetry snapshot.

    Returns:
        {
            "risk_score": float (0-1),
            "active_constraints": [
                {"type": str, "severity": str, "message": str, "weight": float, "value": any}
            ]
        }
    """
    active = []
    total_risk = 0.0

    for field, op, threshold, severity, weight, ctype, message in CONSTRAINT_RULES:
        value = telemetry_snapshot.get(field)
        if value is None:
            continue

        triggered = False
        if op == "<" and isinstance(value, (int, float)):
            triggered = value < threshold
        elif op == ">" and isinstance(value, (int, float)):
            triggered = value > threshold
        elif op == "!=":
            triggered = value != threshold
        elif op == "==":
            triggered = value == threshold

        if triggered:
            # Avoid double-counting: only take the worst severity per type
            existing_types = [c["type"] for c in active]
            if ctype in existing_types:
                # Replace if this is higher severity (CRITICAL > WARNING)
                idx = existing_types.index(ctype)
                if severity == "CRITICAL" and active[idx]["severity"] != "CRITICAL":
                    total_risk -= active[idx]["weight"]
                    active[idx] = {
                        "type": ctype,
                        "severity": severity,
                        "message": message,
                        "weight": round(weight, 3),
                        "value": value,
                    }
                    total_risk += weight
            else:
                active.append({
                    "type": ctype,
                    "severity": severity,
                    "message": message,
                    "weight": round(weight, 3),
                    "value": value,
                })
                total_risk += weight

    risk_score = round(min(1.0, max(0.0, total_risk)), 3)

    return {
        "risk_score": risk_score,
        "active_constraints": active,
    }
