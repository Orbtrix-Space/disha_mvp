"""
DISHA Beta — Intelligence Layer API Routes
GET /intelligence/autonomy, /constraints, /power-projection, /decisions
"""

from fastapi import APIRouter
from backend.core.power_module import project_power

router = APIRouter(prefix="/intelligence", tags=["Intelligence"])


def get_deps():
    from backend.main import satellite, autonomy_manager, intelligence_cache
    return satellite, autonomy_manager, intelligence_cache


@router.get("/autonomy")
def get_autonomy_status():
    _, _, cache = get_deps()
    return cache["autonomy"]


@router.get("/constraints")
def get_constraints():
    _, _, cache = get_deps()
    return cache["constraints"]


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


@router.get("/decisions")
def get_autonomy_decisions():
    _, autonomy_manager, _ = get_deps()
    return {"decisions": autonomy_manager.get_decisions_log()}
