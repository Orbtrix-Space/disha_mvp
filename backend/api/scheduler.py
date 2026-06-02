"""
DISHA — Constellation Tasking API (NEXUS-style)

Endpoints power the SCHEDULE page: mission setup, target deck upload,
constellation propagation, optimizer + FIFO baseline, analytics, status.
"""

from __future__ import annotations

import io
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from backend.schedule.constellation import (
    SatelliteSpec, default_constellation, sample_orbit,
)
from backend.schedule.scheduler import optimize, analytics


router = APIRouter(prefix="/scheduler", tags=["Constellation tasking"])


def _state():
    from backend.main import scheduler_state
    return scheduler_state


# ─── Request / response models ───────────────────────────────────────

class HorizonRequest(BaseModel):
    horizon_start: Optional[str] = None
    horizon_stop: Optional[str] = None
    compare_baseline: bool = True


class MissionUpdateRequest(BaseModel):
    mission_name: Optional[str] = None
    inclination_deg: Optional[float] = None
    altitude_km: Optional[float] = None
    raan_base_deg: Optional[float] = None


# ─── Serializers ─────────────────────────────────────────────────────

def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _sat_to_dict(s: SatelliteSpec) -> dict:
    return {
        "sat_id": s.sat_id,
        "name": s.name,
        "semi_major_axis_km": round(s.semi_major_axis_km, 3),
        "altitude_km": round(s.altitude_km, 3),
        "inclination_deg": round(s.inclination_deg, 3),
        "raan_deg": round(s.raan_deg, 3),
        "ltan": s.ltan_str,
        "period_sec": round(s.period_sec, 1),
        "period_min": round(s.period_sec / 60.0, 2),
        "eccentricity": 0.0,
        "color": s.color,
    }


def _target_to_dict(t: dict) -> dict:
    return {
        "request_id": t["request_id"],
        "aoi_name": t["aoi_name"],
        "lat_deg": t["lat_deg"],
        "lon_deg": t["lon_deg"],
        "start_time": _iso(t["start_time"]),
        "stop_time":  _iso(t["stop_time"]),
        "priority": int(t["priority"]),
        "duration_sec": int(t["duration_sec"]),
        "cloud_max_pct": float(t["cloud_max_pct"]),
    }


def _scheduled_to_dict(p) -> dict:
    return {
        "request_id": p.request_id,
        "aoi_name": p.aoi_name,
        "sat_id": p.sat_id,
        "start_time": _iso(p.start),
        "stop_time": _iso(p.stop),
        "priority": p.priority,
        "cloud_pct": p.cloud_pct,
        "max_elevation_deg": round(p.max_elevation_deg, 1),
    }


def _rejected_to_dict(r) -> dict:
    return {
        "request_id": r.request_id,
        "aoi_name": r.aoi_name,
        "priority": r.priority,
        "reason": r.reason,
        "detail": r.detail,
    }


def _result_to_dict(result) -> dict:
    if result is None:
        return {}
    return {
        "scheduled": [_scheduled_to_dict(p) for p in result.scheduled],
        "rejected":  [_rejected_to_dict(r) for r in result.rejected],
        "n_targets": result.n_targets,
        "horizon_start": _iso(result.horizon_start) if result.horizon_start else None,
        "horizon_stop":  _iso(result.horizon_stop) if result.horizon_stop else None,
        "elapsed_ms": round(result.elapsed_ms, 1),
    }


# ─── Routes ──────────────────────────────────────────────────────────

@router.get("/state")
def get_state():
    """Bootstrap snapshot for the page — mission + horizon + deck summary."""
    st = _state()
    return {
        "mission_name": st.mission_name,
        "constellation": [_sat_to_dict(s) for s in st.constellation],
        "horizon_start": _iso(st.horizon_start),
        "horizon_stop": _iso(st.horizon_stop),
        "deck_filename": st.deck_filename,
        "target_count": len(st.targets),
        "has_result": st.last_result is not None,
    }


@router.get("/constellation")
def get_constellation():
    st = _state()
    sats = st.constellation
    return {
        "constellation_size": len(sats),
        "satellites": [_sat_to_dict(s) for s in sats],
        "avg_period_min": round(
            sum(s.period_sec for s in sats) / len(sats) / 60.0, 2
        ) if sats else 0.0,
        "avg_altitude_km": round(
            sum(s.altitude_km for s in sats) / len(sats), 3
        ) if sats else 0.0,
    }


@router.get("/constellation/tracks")
def get_constellation_tracks(step_sec: float = 60.0):
    """Sampled ECI + lat/lon for each sat across the current horizon — feeds
    the 3D orbital-planes plot."""
    st = _state()
    return {
        "horizon_start": _iso(st.horizon_start),
        "horizon_stop": _iso(st.horizon_stop),
        "tracks": [
            {
                "sat_id": s.sat_id,
                "color": s.color,
                "samples": sample_orbit(s, st.horizon_start, st.horizon_stop,
                                        step_sec=step_sec),
            }
            for s in st.constellation
        ],
    }


@router.get("/targets")
def get_targets():
    st = _state()
    return {
        "deck_filename": st.deck_filename,
        "count": len(st.targets),
        "targets": [_target_to_dict(t) for t in st.targets],
    }


@router.post("/targets/upload")
async def upload_targets(file: UploadFile = File(...)):
    """
    Parse an xlsx with columns:
        request_id, aoi_name, lat_deg, lon_deg, start_time, stop_time,
        priority, duration_sec, cloud_max_pct
    """
    import openpyxl
    try:
        contents = await file.read()
        wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            raise ValueError("Empty workbook.")
        header = [str(c).strip() if c is not None else "" for c in rows[0]]
        targets = []
        for row in rows[1:]:
            if all(c is None for c in row):
                continue
            d = {header[i]: row[i] for i in range(min(len(header), len(row)))}
            targets.append({
                "request_id":    str(d["request_id"]),
                "aoi_name":      str(d["aoi_name"]),
                "lat_deg":       float(d["lat_deg"]),
                "lon_deg":       float(d["lon_deg"]),
                "start_time":    _parse_dt(d["start_time"]),
                "stop_time":     _parse_dt(d["stop_time"]),
                "priority":      int(d["priority"]),
                "duration_sec":  int(d["duration_sec"]),
                "cloud_max_pct": float(d["cloud_max_pct"]),
            })
        _state().replace_targets(targets, file.filename or "uploaded.xlsx")
        return {"ok": True, "count": len(targets), "filename": file.filename}
    except KeyError as e:
        raise HTTPException(status_code=400,
                            detail=f"Missing column: {e.args[0]}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def _parse_dt(v) -> datetime:
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    s = str(v).replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.post("/horizon")
def set_horizon(req: HorizonRequest):
    st = _state()
    if req.horizon_start:
        st.set_horizon(_parse_dt(req.horizon_start), st.horizon_stop)
    if req.horizon_stop:
        st.set_horizon(st.horizon_start, _parse_dt(req.horizon_stop))
    return {"ok": True,
            "horizon_start": _iso(st.horizon_start),
            "horizon_stop": _iso(st.horizon_stop)}


@router.post("/mission")
def set_mission(req: MissionUpdateRequest):
    st = _state()
    if req.mission_name:
        st.set_mission_name(req.mission_name)
    if any(v is not None for v in (req.inclination_deg, req.altitude_km, req.raan_base_deg)):
        inc = req.inclination_deg if req.inclination_deg is not None else 97.4
        alt = req.altitude_km if req.altitude_km is not None else 500.0
        raan = req.raan_base_deg if req.raan_base_deg is not None else 22.0
        st.set_constellation(default_constellation(
            altitude_km=alt, inclination_deg=inc, raan_base_deg=raan,
        ))
    return {"ok": True, "mission_name": st.mission_name,
            "constellation": [_sat_to_dict(s) for s in st.constellation]}


@router.post("/optimize")
def run_optimize(req: HorizonRequest):
    st = _state()
    if req.horizon_start:
        st.set_horizon(_parse_dt(req.horizon_start), st.horizon_stop)
    if req.horizon_stop:
        st.set_horizon(st.horizon_start, _parse_dt(req.horizon_stop))
    st.last_result = optimize(
        st.constellation, st.targets, st.horizon_start, st.horizon_stop,
        fifo=False,
    )
    if req.compare_baseline:
        st.last_baseline = optimize(
            st.constellation, st.targets, st.horizon_start, st.horizon_stop,
            fifo=True,
        )
    else:
        st.last_baseline = None
    return {
        "ok": True,
        "result":  _result_to_dict(st.last_result),
        "baseline": _result_to_dict(st.last_baseline) if st.last_baseline else None,
        "analytics": analytics(st.last_result, st.constellation),
        "baseline_analytics": analytics(st.last_baseline, st.constellation)
            if st.last_baseline else None,
    }


@router.get("/schedule")
def get_schedule():
    st = _state()
    return {
        "result":  _result_to_dict(st.last_result),
        "baseline": _result_to_dict(st.last_baseline) if st.last_baseline else None,
    }


@router.get("/analytics")
def get_analytics():
    st = _state()
    if st.last_result is None:
        return {"has_result": False}
    return {
        "has_result": True,
        "analytics": analytics(st.last_result, st.constellation),
        "baseline_analytics": analytics(st.last_baseline, st.constellation)
            if st.last_baseline else None,
    }


@router.get("/system-status")
def system_status():
    st = _state()
    sats = st.constellation
    return {
        "services": [
            {"key": "api", "label": "API",
             "status": "ONLINE",
             "detail": "FastAPI · uvicorn"},
            {"key": "constellation", "label": "Constellation",
             "status": "ACTIVE",
             "detail": f"{len(sats)} sats · SSO · "
                       f"{round(sum(s.altitude_km for s in sats) / len(sats))} km · "
                       f"{sats[0].inclination_deg:.1f}°"},
            {"key": "ground", "label": "Ground Station",
             "status": "ONLINE",
             "detail": "SVALBARD (demo)"},
            {"key": "optimizer", "label": "Optimizer",
             "status": "READY",
             "detail": "GREEDY · J2 · priority-aware · per-sat non-overlap"},
            {"key": "weather", "label": "Weather Mock",
             "status": "DETERMINISTIC",
             "detail": "seed-stable · per-AOI cloud %"},
            {"key": "demo", "label": "Demo Mode",
             "status": "ACTIVE",
             "detail": "no auth · no DB · no SGP4"},
        ],
    }
