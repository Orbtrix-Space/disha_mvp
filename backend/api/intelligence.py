"""
DISHA Beta — Intelligence Layer API Routes
Enhanced autonomy, constraints, margins, decisions, feasibility, and override endpoints.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from backend.shared.power import project_power

router = APIRouter(prefix="/intelligence", tags=["Intelligence"])


def get_deps():
    from backend.main import satellite, autonomy_manager, intelligence_cache
    return satellite, autonomy_manager, intelligence_cache


def get_ai_monitor():
    from backend.main import ai_monitor
    return ai_monitor


# ─── Autonomy Status ──────────────────────────────────────────

@router.get("/autonomy")
def get_autonomy_status():
    """Full autonomy status including mode, objective, confidence, feasibility, coupling."""
    _, _, cache = get_deps()
    return cache["autonomy"]


# ─── Constraints & Margins ────────────────────────────────────

@router.get("/constraints")
def get_constraints():
    """Constraint evaluation with violations, margins, and recommended mode."""
    _, _, cache = get_deps()
    return cache["constraints"]


@router.get("/margins")
def get_margins():
    """Subsystem margin status (power, thermal, comms, storage, orbit)."""
    _, _, cache = get_deps()
    constraints = cache.get("constraints", {})
    return {
        "margins": constraints.get("margins", {}),
        "risk_score": constraints.get("risk_score", 0),
        "recommended_mode": constraints.get("recommended_mode", "AUTONOMOUS"),
    }


# ─── Power Projection ────────────────────────────────────────

@router.get("/power-projection")
def get_power_projection():
    satellite, _, _ = get_deps()
    try:
        return project_power(satellite)
    except Exception as e:
        return {
            "current_battery": 0,
            "current_mode": "UNKNOWN",
            "projected_next_eclipse": 0,
            "projected_next_orbit": 0,
            "time_to_next_eclipse_min": 0,
            "power_warning": False,
            "warning_reason": str(e),
        }


# ─── Decision Log ────────────────────────────────────────────

@router.get("/decisions")
def get_autonomy_decisions():
    """Full decision log with structured decision objects."""
    _, autonomy_manager, _ = get_deps()
    return {"decisions": autonomy_manager.get_decisions_log()}


@router.get("/decisions/latest")
def get_latest_decisions(count: int = 10):
    """Latest N decisions."""
    _, autonomy_manager, _ = get_deps()
    return {"decisions": autonomy_manager.get_latest_decisions(count)}


# ─── Feasibility ─────────────────────────────────────────────

@router.get("/feasibility")
def get_feasibility():
    """Current feasibility assessment for all subsystem dimensions."""
    _, autonomy_manager, _ = get_deps()
    status = autonomy_manager.get_status()
    return {
        "feasibility": status.get("feasibility", {}),
        "all_feasible": all(
            v.get("feasible", True) for v in status.get("feasibility", {}).values()
        ),
    }


# ─── Coupling Effects ────────────────────────────────────────

@router.get("/coupling")
def get_coupling_effects():
    """Active subsystem coupling effects and interactions."""
    _, autonomy_manager, _ = get_deps()
    status = autonomy_manager.get_status()
    return {
        "coupling_effects": status.get("coupling_effects", []),
        "count": len(status.get("coupling_effects", [])),
    }


# ─── AI Monitor ───────────────────────────────────────────────

@router.get("/ai-monitor")
def get_ai_monitor_status():
    """Latest AI monitor result + diagnostics (param count, latency)."""
    _, _, cache = get_deps()
    monitor = get_ai_monitor()
    result = cache.get("ai_monitor", {})
    return {
        "result": result,
        "param_count": monitor.param_count,
        "enabled": monitor.enabled,
        "model_loaded": monitor.model_loaded,
        "sequence_length": monitor.sequence_length,
        "zscore_flag_threshold": monitor.zscore_flag_threshold,
        "anomaly_threshold_warning": monitor.warning_threshold,
        "anomaly_threshold_critical": monitor.critical_threshold,
        "latency_stats": monitor.latency_stats(),
    }


# ─── Operator Override ────────────────────────────────────────

class OverrideRequest(BaseModel):
    mode: str
    operator: Optional[str] = "OPERATOR"
    reason: Optional[str] = "Manual override"


@router.post("/override")
def set_override(req: OverrideRequest):
    """Set operator override for autonomy mode."""
    _, autonomy_manager, _ = get_deps()
    return autonomy_manager.set_mode(req.mode, req.operator, req.reason)


@router.post("/override/release")
def release_override(operator: str = "OPERATOR"):
    """Release operator override, resume automatic mode selection."""
    _, autonomy_manager, _ = get_deps()
    return autonomy_manager.release_override(operator)
