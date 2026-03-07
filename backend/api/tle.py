"""
DISHA Beta — TLE API Routes
POST /tle/load, GET /tle/current
"""

import numpy as np
from datetime import datetime, timezone
from fastapi import APIRouter
from backend.models.schemas import TLELoadRequest

router = APIRouter(prefix="/tle", tags=["TLE"])


def get_deps():
    from backend.main import satellite, tle_manager, fdir_engine, ws_manager
    return satellite, tle_manager, fdir_engine, ws_manager


@router.post("/load")
async def load_tle(payload: TLELoadRequest):
    satellite, tle_manager, fdir_engine, ws_manager = get_deps()
    try:
        info = await tle_manager.fetch_tle(payload.norad_id)
        satellite.reset()
        satellite.tle_manager = tle_manager
        satellite.current_time = datetime.now(timezone.utc)
        pos, vel = tle_manager.propagate_at(satellite.current_time)
        satellite.position = np.array(pos)
        satellite.velocity = np.array(vel)
        fdir_engine.reset()
        # Notify frontend to clear old satellite state
        await ws_manager.broadcast({
            "type": "tle_loaded",
            "satellite_name": tle_manager.satellite_name,
            "norad_id": payload.norad_id,
        })
        print(f"[TLE] Loaded: {tle_manager.satellite_name} (NORAD {payload.norad_id})")
        return {"status": "SUCCESS", "tle": info}
    except Exception as e:
        print(f"[TLE ERROR] NORAD {payload.norad_id}: {e}")
        return {"status": "ERROR", "message": str(e)}


@router.get("/current")
def get_current_tle():
    _, tle_manager, _, _ = get_deps()
    return tle_manager.get_tle_info()
