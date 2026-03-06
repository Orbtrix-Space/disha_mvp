"""
DISHA Beta — FDIR API Routes
GET /fdir/alerts, GET /fdir/status, GET /fdir/summary
"""

from fastapi import APIRouter

router = APIRouter(prefix="/fdir", tags=["FDIR"])


def get_deps():
    from backend.main import fdir_engine
    return fdir_engine


@router.get("/alerts")
def get_fdir_alerts():
    fdir_engine = get_deps()
    return {"alerts": fdir_engine.get_active_alerts(), "history": fdir_engine.get_history()}


@router.get("/status")
def get_fdir_status():
    fdir_engine = get_deps()
    return fdir_engine.get_status()


@router.get("/summary")
def get_fdir_summary():
    fdir_engine = get_deps()
    return fdir_engine.get_summary()
