"""
DISHA Beta — Telemetry Recorder API Routes
CSV auto-records always. JSON snapshots via start/stop.
"""

import os
from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(prefix="/recorder", tags=["recorder"])


def get_recorder():
    from backend.main import telemetry_recorder
    return telemetry_recorder


@router.get("/status")
def recorder_status():
    """Get current recorder status (CSV path, frame count, JSON state)."""
    return get_recorder().status()


@router.post("/json/start")
def start_json_recording():
    """Start buffering frames for a JSON snapshot."""
    get_recorder().start_json()
    return {"status": "recording", "message": "JSON recording started"}


@router.post("/json/stop")
def stop_json_recording():
    """Stop JSON recording and save to file."""
    path = get_recorder().stop_json()
    if path is None:
        return {"status": "stopped", "message": "No frames recorded", "file": None}
    return {"status": "saved", "file": path}


@router.get("/download/csv")
def download_csv():
    """Download the current session's CSV telemetry log."""
    recorder = get_recorder()
    recorder._csv_file.flush()
    return FileResponse(
        recorder._csv_path,
        media_type="text/csv",
        filename=os.path.basename(recorder._csv_path),
    )


@router.get("/download/json")
def download_latest_json():
    """Download the most recent JSON telemetry snapshot."""
    recorder = get_recorder()
    log_dir = recorder.output_dir
    if not os.path.exists(log_dir):
        return {"error": "No recordings found"}
    files = sorted(
        [f for f in os.listdir(log_dir) if f.endswith(".json")],
        reverse=True,
    )
    if not files:
        return {"error": "No JSON recordings found"}
    return FileResponse(
        os.path.join(log_dir, files[0]),
        media_type="application/json",
        filename=files[0],
    )
