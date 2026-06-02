"""
DISHA Beta — Constraint Engine
Structured constraint evaluation with margins, violations, traceability,
and recommended mode output. Deterministic, rule-based only.
"""

from backend.shared.models.config import get_config


# Field name mappings for telemetry flexibility
FIELD_MAPPINGS = {
    "battery_soc": ["battery_pct", "battery_soc"],
    "component_temp": ["panel_temp_c", "component_temp"],
    "battery_temp": ["battery_temp_c", "battery_temp"],
    "snr": ["snr_db", "snr"],
    "storage_pct": ["storage_pct"],
    "altitude": ["altitude_km", "altitude"],
    "link_status": ["link_status"],
    "pointing_error": ["pointing_error"],
    "solar_current": ["solar_panel_current_a", "solar_current"],
    "bus_voltage": ["bus_voltage", "bus_voltage_v"],
    "angular_rate": ["angular_rate", "angular_rate_deg_s"],
}

# Margin definitions: parameter -> (nominal_low, nominal_high, unit)
# Used to compute how far a parameter is from its safe operating range
MARGIN_DEFINITIONS = {
    "POWER": {
        "parameter": "battery_soc",
        "nominal_range": [40, 100],
        "warning_range": [25, 100],
        "critical_range": [15, 100],
        "unit": "%",
    },
    "THERMAL_PANEL": {
        "parameter": "component_temp",
        "nominal_range": [-20, 60],
        "warning_range": [-30, 75],
        "critical_range": [-40, 85],
        "unit": "°C",
    },
    "THERMAL_BATTERY": {
        "parameter": "battery_temp",
        "nominal_range": [5, 35],
        "warning_range": [0, 40],
        "critical_range": [-5, 45],
        "unit": "°C",
    },
    "COMMS": {
        "parameter": "snr",
        "nominal_range": [10, 50],
        "warning_range": [8, 50],
        "critical_range": [5, 50],
        "unit": "dB",
    },
    "STORAGE": {
        "parameter": "storage_pct",
        "nominal_range": [0, 80],
        "warning_range": [0, 90],
        "critical_range": [0, 95],
        "unit": "%",
    },
    "ORBIT": {
        "parameter": "altitude",
        "nominal_range": [300, 800],
        "warning_range": [250, 1000],
        "critical_range": [200, 1200],
        "unit": "km",
    },
}


def _get_value(telemetry: dict, param: str):
    """Get telemetry value by parameter name, trying multiple field names."""
    if param in telemetry:
        return telemetry[param]
    for alt in FIELD_MAPPINGS.get(param, []):
        if alt in telemetry:
            return telemetry[alt]
    return None


def _compute_margin(value, margin_def: dict) -> dict:
    """Compute margin status for a parameter against its operating ranges."""
    if value is None:
        return {"status": "UNKNOWN", "margin_pct": 0, "value": None, "unit": margin_def["unit"]}

    nom_lo, nom_hi = margin_def["nominal_range"]
    warn_lo, warn_hi = margin_def["warning_range"]
    crit_lo, crit_hi = margin_def["critical_range"]
    unit = margin_def["unit"]

    # For parameters where lower is worse (battery, snr, altitude)
    # and where higher is worse (temp high, storage)
    # We compute margin as distance from nearest critical boundary
    is_inverted = margin_def["parameter"] in ("storage_pct", "component_temp", "battery_temp")

    if is_inverted:
        # Higher values are worse — margin is distance from critical high
        if value <= nom_hi:
            status = "NOMINAL"
            margin_pct = round(100 * (1 - value / crit_hi), 1) if crit_hi > 0 else 100
        elif value <= warn_hi:
            status = "WARNING"
            margin_pct = round(100 * (crit_hi - value) / (crit_hi - warn_hi), 1) if crit_hi > warn_hi else 0
        elif value <= crit_hi:
            status = "CRITICAL"
            margin_pct = round(100 * (crit_hi - value) / (crit_hi - warn_hi), 1) if crit_hi > warn_hi else 0
        else:
            status = "VIOLATION"
            margin_pct = 0

        # Also check low side for thermal
        if margin_def["parameter"] in ("component_temp", "battery_temp"):
            if value < crit_lo:
                status = "VIOLATION"
                margin_pct = 0
            elif value < warn_lo:
                status = "CRITICAL"
                margin_pct = round(100 * (value - crit_lo) / (warn_lo - crit_lo), 1) if warn_lo > crit_lo else 0
            elif value < nom_lo:
                status = "WARNING"
                margin_pct = round(100 * (value - warn_lo) / (nom_lo - warn_lo), 1) if nom_lo > warn_lo else 0
    else:
        # Lower values are worse (battery, snr, altitude)
        if value >= nom_lo:
            status = "NOMINAL"
            margin_pct = round(100 * (value - crit_lo) / (nom_lo - crit_lo), 1) if nom_lo > crit_lo else 100
        elif value >= warn_lo:
            status = "WARNING"
            margin_pct = round(100 * (value - crit_lo) / (warn_lo - crit_lo), 1) if warn_lo > crit_lo else 50
        elif value >= crit_lo:
            status = "CRITICAL"
            margin_pct = round(100 * (value - crit_lo) / (warn_lo - crit_lo), 1) if warn_lo > crit_lo else 10
        else:
            status = "VIOLATION"
            margin_pct = 0

    return {
        "status": status,
        "margin_pct": max(0, min(100, margin_pct)),
        "value": value,
        "unit": unit,
    }


def compute_margins(telemetry: dict) -> dict:
    """Compute margins for all tracked subsystems."""
    margins = {}
    for category, margin_def in MARGIN_DEFINITIONS.items():
        value = _get_value(telemetry, margin_def["parameter"])
        margins[category] = _compute_margin(value, margin_def)
    return margins


def evaluate_constraints(telemetry_snapshot: dict) -> dict:
    """
    Evaluate all constraint rules against a telemetry snapshot.

    Returns structured result with:
    - risk_score: weighted aggregate (0-1)
    - violations: list of structured violation objects with full traceability
    - margins: per-subsystem margin status
    - recommended_mode: suggested autonomy mode based on constraint state
    - active_constraints: legacy-compatible list (backwards compat)
    """
    config = get_config()
    rules = config.get("constraint_rules", [])

    # Evaluate all rules, collect structured violations
    violations = []
    triggered_raw = []

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
            violation = {
                "constraint_id": f"{category}_{param}_{op}{threshold}",
                "parameter": param,
                "category": category,
                "severity": severity,
                "message": message,
                "operator": op,
                "threshold": threshold,
                "actual_value": value,
                "weight": round(weight, 3),
                "type": category,
            }
            violations.append(violation)
            triggered_raw.append(violation)

    # Deduplicate by category: keep highest weight per category
    category_best = {}
    for v in violations:
        cat = v["category"]
        if cat not in category_best or v["weight"] > category_best[cat]["weight"]:
            category_best[cat] = v

    deduped = list(category_best.values())

    # Compute risk score: sum of deduplicated weights, normalized to 0-1
    total_risk = sum(c["weight"] for c in deduped)
    risk_score = round(min(1.0, max(0.0, total_risk)), 3)

    # Compute margins
    margins = compute_margins(telemetry_snapshot)

    # Determine recommended mode based on risk score and violation severity
    autonomy_config = config.get("autonomy", {})
    thresholds = autonomy_config.get("mode_thresholds", {})
    safe_enter = thresholds.get("safe_enter", 0.6)
    guarded_enter = thresholds.get("guarded_enter", 0.3)

    has_critical = any(v["severity"] == "CRITICAL" for v in deduped)

    if risk_score >= safe_enter or has_critical:
        recommended_mode = "SAFE"
    elif risk_score >= guarded_enter:
        recommended_mode = "GUARDED"
    else:
        recommended_mode = "AUTONOMOUS"

    # Violated categories for quick lookup
    violated_categories = [v["category"] for v in deduped]

    return {
        "risk_score": risk_score,
        "violations": deduped,
        "all_violations": violations,
        "margins": margins,
        "recommended_mode": recommended_mode,
        "violated_categories": violated_categories,
        # Legacy compatibility
        "active_constraints": deduped,
    }
