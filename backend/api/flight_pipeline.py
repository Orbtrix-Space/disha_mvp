"""
DISHA — Flight Pipeline API

Operator surface for the automated OD → conjunction screening →
maneuver recommendation pipeline. Endpoints:

  POST /flight/ingest_gps        — paste a CSV arc of GPS fixes
  POST /flight/ingest_synthetic  — build a synthetic noisy arc (demo)
  POST /flight/run_pipeline      — fire the full chain (manual trigger)
  GET  /flight/pipeline          — current pipeline status + outputs
  POST /flight/pipeline/reset    — clear last run + GPS arc
  POST /flight/maneuver/approve  — operator approval (status only)
"""

from __future__ import annotations

from typing import Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/flight", tags=["Flight pipeline"])


def _pipeline():
    from backend.main import flight_pipeline
    return flight_pipeline


def _satellite():
    from backend.main import satellite
    return satellite


# ─── Request models ───────────────────────────────────────────────────

class IngestGPSRequest(BaseModel):
    csv: str
    sigma_m: float = 5.0
    frame: str = "ECI"           # ECEF rotation is a follow-up
    source: str = "paste"


class IngestSyntheticRequest(BaseModel):
    """Build a noisy arc by propagating the current satellite state."""
    n_fixes: int = 15
    span_seconds: float = 600.0
    noise_m: float = 5.0


class RunPipelineRequest(BaseModel):
    horizon_hours: float = 24.0
    coarse_step_seconds: float = Field(default=30.0, ge=10.0, le=120.0)
    pc_green: float = 1e-7
    pc_red: float = 1e-4


class ManeuverApprovalRequest(BaseModel):
    approved: bool
    operator: str = "OPERATOR"
    note: Optional[str] = None


class CatalogUploadRequest(BaseModel):
    """Operator-supplied catalogue of secondaries (3-line TLE blob)."""
    tle: str
    source: str = "paste"


# ─── Routes ───────────────────────────────────────────────────────────

@router.post("/ingest_gps")
def ingest_gps(req: IngestGPSRequest):
    pipeline = _pipeline()
    try:
        meta = pipeline.ingest_csv(
            req.csv, sigma_m=req.sigma_m,
            frame=req.frame, source=req.source,
        )
        return {"ok": True, "gps": meta}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ingest_synthetic")
def ingest_synthetic(req: IngestSyntheticRequest):
    pipeline = _pipeline()
    sat = _satellite()
    state = np.concatenate([sat.position, sat.velocity])
    meta = pipeline.ingest_synthetic(
        state, sat.current_time,
        n_fixes=req.n_fixes, span_seconds=req.span_seconds,
        noise_m=req.noise_m,
    )
    return {"ok": True, "gps": meta}


@router.post("/run_pipeline")
def run_pipeline(req: RunPipelineRequest):
    pipeline = _pipeline()
    run = pipeline.run(
        horizon_seconds=req.horizon_hours * 3600.0,
        coarse_step_seconds=req.coarse_step_seconds,
        pc_green=req.pc_green,
        pc_red=req.pc_red,
    )
    return {"ok": True, "run": run.to_dict()}


@router.get("/pipeline")
def pipeline_status():
    return _pipeline().status()


@router.post("/pipeline/reset")
def reset_pipeline():
    _pipeline().reset()
    return {"ok": True}


@router.post("/catalog")
def upload_catalog(req: CatalogUploadRequest):
    """Load a TLE catalogue to screen against (replaces synthetic threats)."""
    pipeline = _pipeline()
    try:
        meta = pipeline.load_catalog_tle(req.tle, source=req.source)
        return {"ok": True, "catalog": meta}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/catalog")
def clear_catalog():
    _pipeline().clear_catalog()
    return {"ok": True}


@router.get("/catalog")
def get_catalog():
    p = _pipeline()
    return {
        "catalog": dict(p.catalog_meta),
        "count": len(p.catalog),
    }


@router.post("/maneuver/approve")
def approve_maneuver(req: ManeuverApprovalRequest):
    """
    Mark the pending maneuver as approved or rejected. This does NOT
    execute the burn — execution would be a separate command-engine
    integration (out of scope for the pipeline v1).
    """
    pipeline = _pipeline()
    if not pipeline.last_run or not pipeline.last_run.maneuver:
        raise HTTPException(status_code=404, detail="No pending maneuver.")
    pipeline.last_run.maneuver["status"] = "APPROVED" if req.approved else "REJECTED"
    pipeline.last_run.maneuver["approved_by"] = req.operator
    pipeline.last_run.maneuver["approval_note"] = req.note
    pipeline.last_run.event(
        "recommend",
        "info" if req.approved else "warn",
        f"Operator {req.operator} {'approved' if req.approved else 'rejected'} "
        f"the candidate maneuver."
    )
    return {"ok": True, "maneuver": pipeline.last_run.maneuver}
