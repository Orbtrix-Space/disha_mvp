"""
DISHA Beta — Core API Routes
GET /, GET /satellite-status, POST /reset
"""

from datetime import datetime, timezone
from fastapi import APIRouter

router = APIRouter()


def get_deps():
    """Get global dependencies (imported at call time to avoid circular imports)."""
    from backend.main import satellite, tle_manager, ws_manager, fdir_engine, command_engine, autonomy_manager
    return satellite, tle_manager, ws_manager, fdir_engine, command_engine, autonomy_manager


@router.get("/")
def read_root():
    satellite, tle_manager, ws_manager, fdir_engine, _, _ = get_deps()
    uptime = (datetime.now(timezone.utc) - satellite.start_time).total_seconds()
    return {
        "system": "DISHA-SAT",
        "version": "Beta",
        "status": "ONLINE",
        "uptime_seconds": round(uptime, 1),
        "ws_clients": ws_manager.client_count,
        "tle_loaded": tle_manager.satrec is not None,
    }


@router.get("/satellite-status")
def get_satellite_status():
    satellite, _, _, _, _, _ = get_deps()
    return satellite.get_state()


@router.post("/reset")
def reset_satellite():
    satellite, tle_manager, _, fdir_engine, command_engine, autonomy_manager = get_deps()
    from backend.main import reset_state
    reset_state()
    return {"status": "RESET", "satellite_health": satellite.get_state()}
