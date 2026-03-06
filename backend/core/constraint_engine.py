"""
DISHA Beta — Constraint Engine
Weighted constraint evaluation with risk score computation.
Category deduplication: highest weight per category.
"""

from backend.models.config import get_config


# Default constraint rules (12 minimum per spec)
DEFAULT_CONSTRAINTS = [
    {"parameter": "battery_soc", "threshold": 25, "weight": 0.35, "category": "POWER", "operator": "<", "message": "Battery critically low (<25%)"},
    {"parameter": "battery_soc", "threshold": 40, "weight": 0.15, "category": "POWER", "operator": "<", "message": "Battery low (<40%)"},
    {"parameter": "battery_soc", "threshold": 60, "weight": 0.05, "category": "POWER", "operator": "<", "message": "Battery marginal (<60%)"},
    {"parameter": "component_temp", "threshold": 75, "weight": 0.10, "category": "THERMAL", "operator": ">", "message": "Panel temp high (>75°C)"},
    {"parameter": "component_temp", "threshold": -30, "weight": 0.10, "category": "THERMAL", "operator": "<", "message": "Panel temp low (<-30°C)"},
    {"parameter": "battery_temp", "threshold": 40, "weight": 0.10, "category": "THERMAL_BATT", "operator": ">", "message": "Battery temp high (>40°C)"},
    {"parameter": "battery_temp", "threshold": 5, "weight": 0.08, "category": "THERMAL_BATT", "operator": "<", "message": "Battery temp low (<5°C)"},
    {"parameter": "link_status", "threshold": "NOMINAL", "weight": 0.30, "category": "COMMS", "operator": "!=", "message": "Link degraded"},
    {"parameter": "snr", "threshold": 8, "weight": 0.10, "category": "COMMS_SNR", "operator": "<", "message": "SNR degraded (<8 dB)"},
    {"parameter": "snr", "threshold": 5, "weight": 0.20, "category": "COMMS_SNR", "operator": "<", "message": "SNR critically low (<5 dB)"},
    {"parameter": "storage_pct", "threshold": 90, "weight": 0.12, "category": "STORAGE", "operator": ">", "message": "Storage above 90%"},
    {"parameter": "altitude", "threshold": 250, "weight": 0.30, "category": "ORBIT", "operator": "<", "message": "Altitude dangerously low (<250 km)"},
]

# Field name mappings for flexibility
FIELD_MAPPINGS = {
    "battery_soc": ["battery_pct", "battery_soc"],
    "component_temp": ["panel_temp_c", "component_temp"],
    "battery_temp": ["battery_temp_c", "battery_temp"],
    "snr": ["snr_db", "snr"],
    "storage_pct": ["storage_pct"],
    "altitude": ["altitude_km", "altitude"],
    "link_status": ["link_status"],
    "pointing_error": ["pointing_error"],
}


def _get_value(telemetry: dict, param: str):
    """Get telemetry value by parameter name, trying multiple field names."""
    if param in telemetry:
        return telemetry[param]
    for alt in FIELD_MAPPINGS.get(param, []):
        if alt in telemetry:
            return telemetry[alt]
    return None


def evaluate_constraints(telemetry_snapshot: dict) -> dict:
    """
    Evaluate all constraint rules against a telemetry snapshot.
    Deduplicates by category (highest weight per category).

    Returns:
        {
            "risk_score": float (0-1),
            "active_constraints": [
                {"type": str, "severity": str, "message": str, "weight": float, "value": any, "category": str}
            ]
        }
    """
    config = get_config()
    rules = config.get("constraint_rules", DEFAULT_CONSTRAINTS)

    # Evaluate all rules, collect triggered constraints
    triggered = []
    for rule in rules:
        param = rule.get("parameter", "")
        op = rule.get("operator", "<")
        threshold = rule.get("threshold")
        weight = rule.get("weight", 0.1)
        category = rule.get("category", "UNKNOWN")
        message = rule.get("message", f"{param} constraint violated")

        value = _get_value(telemetry_snapshot, param)
        if value is None:
            continue

        fired = False
        if op == "<" and isinstance(value, (int, float)):
            fired = value < threshold
        elif op == ">" and isinstance(value, (int, float)):
            fired = value > threshold
        elif op == "!=":
            fired = value != threshold
        elif op == "==":
            fired = value == threshold

        if fired:
            severity = "CRITICAL" if weight >= 0.25 else "WARNING"
            triggered.append({
                "type": category,
                "category": category,
                "severity": severity,
                "message": message,
                "weight": round(weight, 3),
                "value": value,
            })

    # Deduplicate by category: keep highest weight per category
    category_best = {}
    for constraint in triggered:
        cat = constraint["category"]
        if cat not in category_best or constraint["weight"] > category_best[cat]["weight"]:
            category_best[cat] = constraint

    active = list(category_best.values())

    # Compute risk score: sum of deduplicated weights, normalized to 0-1
    total_risk = sum(c["weight"] for c in active)
    risk_score = round(min(1.0, max(0.0, total_risk)), 3)

    return {
        "risk_score": risk_score,
        "active_constraints": active,
    }
