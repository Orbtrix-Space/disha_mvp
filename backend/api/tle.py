"""
DISHA Beta — TLE API Routes
POST /tle/load (NORAD id), /tle/load_raw (paste), /tle/load_elements
(manual orbital elements), GET /tle/current.
"""

import numpy as np
from datetime import datetime, timezone
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from backend.shared.models.schemas import TLELoadRequest

router = APIRouter(prefix="/tle", tags=["TLE"])


def get_deps():
    from backend.main import satellite, tle_manager, fdir_engine, ws_manager
    return satellite, tle_manager, fdir_engine, ws_manager


def _bring_online(satellite, tle_manager, fdir_engine):
    """Shared post-load step: reset state, seed position from the new
    propagator, clear FDIR. Used by all three onboarding modes."""
    satellite.reset()
    satellite.tle_manager = tle_manager
    satellite.current_time = datetime.now(timezone.utc)
    pos, vel = tle_manager.propagate_at(satellite.current_time)
    satellite.position = np.array(pos)
    satellite.velocity = np.array(vel)
    fdir_engine.reset()


async def _announce(ws_manager, tle_manager):
    await ws_manager.broadcast({
        "type": "tle_loaded",
        "satellite_name": tle_manager.satellite_name,
        "norad_id": tle_manager.norad_id,
    })


@router.post("/load")
async def load_tle(payload: TLELoadRequest):
    """Onboard a satellite by NORAD catalog id (fetches TLE from CelesTrak)."""
    satellite, tle_manager, fdir_engine, ws_manager = get_deps()
    try:
        info = await tle_manager.fetch_tle(payload.norad_id)
        _bring_online(satellite, tle_manager, fdir_engine)
        await _announce(ws_manager, tle_manager)
        print(f"[TLE] Loaded: {tle_manager.satellite_name} (NORAD {payload.norad_id})")
        return {"status": "SUCCESS", "tle": info}
    except Exception as e:
        print(f"[TLE ERROR] NORAD {payload.norad_id}: {e}")
        return {"status": "ERROR", "message": str(e)}


class RawTLERequest(BaseModel):
    name: Optional[str] = None
    line1: str
    line2: str


@router.post("/load_raw")
async def load_tle_raw(payload: RawTLERequest):
    """Onboard a satellite from two pasted TLE lines."""
    satellite, tle_manager, fdir_engine, ws_manager = get_deps()
    try:
        info = tle_manager.load_from_lines(payload.name, payload.line1, payload.line2)
        _bring_online(satellite, tle_manager, fdir_engine)
        await _announce(ws_manager, tle_manager)
        print(f"[TLE] Loaded raw: {tle_manager.satellite_name}")
        return {"status": "SUCCESS", "tle": info}
    except Exception as e:
        print(f"[TLE ERROR] raw load: {e}")
        return {"status": "ERROR", "message": str(e)}


class ElementsRequest(BaseModel):
    name: Optional[str] = None
    inclination_deg: float
    raan_deg: float
    eccentricity: float
    arg_perigee_deg: float
    mean_anomaly_deg: float
    mean_motion_rev_day: float


@router.post("/load_elements")
async def load_tle_elements(payload: ElementsRequest):
    """Onboard a satellite from classical mean orbital elements (real SGP4)."""
    satellite, tle_manager, fdir_engine, ws_manager = get_deps()
    try:
        info = tle_manager.load_from_elements(payload.name, payload.model_dump())
        _bring_online(satellite, tle_manager, fdir_engine)
        await _announce(ws_manager, tle_manager)
        print(f"[TLE] Loaded elements: {tle_manager.satellite_name}")
        return {"status": "SUCCESS", "tle": info}
    except Exception as e:
        print(f"[TLE ERROR] elements load: {e}")
        return {"status": "ERROR", "message": str(e)}


@router.get("/current")
def get_current_tle():
    _, tle_manager, _, _ = get_deps()
    return tle_manager.get_tle_info()
