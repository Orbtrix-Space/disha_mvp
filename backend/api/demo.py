"""
DISHA Beta — Demo Control Surface API

Stage-facing endpoints for triggering preset anomalies, watching the
unified loop close in real time, and resetting between rehearsals.
Hidden from normal use behind a frontend query param; the routes
themselves are unauthenticated by design because this is a single-
operator demo binary.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.control.demo_scenarios import (
    SCENARIOS, expected_timeline, list_scenarios,
)


router = APIRouter(prefix="/demo", tags=["Demo"])


def _deps():
    from backend.main import (
        demo_injector, ai_monitor, autonomy_manager,
        demo_timeline_buffer,
    )
    return demo_injector, ai_monitor, autonomy_manager, demo_timeline_buffer


# ─── Schemas ──────────────────────────────────────────────────────────

class InjectRequest(BaseModel):
    scenario_id: str
    intensity: float = Field(default=1.0, ge=0.0, le=1.0)


class CancelRequest(BaseModel):
    run_id: str


# ─── Routes ───────────────────────────────────────────────────────────

@router.get("/scenarios")
def get_scenarios():
    """Three preset scenarios with investor-facing descriptions and
    expected catch times. Doubles as the demo voiceover crib sheet."""
    return {"scenarios": list_scenarios()}


@router.post("/inject_anomaly")
def inject_anomaly(req: InjectRequest):
    """
    Trigger one of the preset anomalies. Returns the run id plus the
    expected timeline (when AI should flag, when rules will flag, when
    autonomy should react). The expected times come from the scenario
    definition — they set demo expectations before the live run.

    If the AI monitor is disabled, the endpoint still succeeds but
    flags `ai_warning` in the response so the operator knows the
    demo will be less compelling: rules will eventually catch the
    drift but the AI-before-rules story disappears.
    """
    injector, ai_monitor, _, _ = _deps()

    if req.scenario_id not in SCENARIOS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown scenario: {req.scenario_id}. "
                   f"Choose from {list(SCENARIOS.keys())}",
        )

    run = injector.trigger(req.scenario_id, req.intensity)
    response = {
        "ok": True,
        "run": run.as_dict(),
        "expected_timeline": expected_timeline(req.scenario_id),
    }
    if not getattr(ai_monitor, "enabled", False) or not getattr(ai_monitor, "model_loaded", False):
        response["ai_warning"] = (
            "AI monitor is disabled or unloaded. Scenario will run but "
            "only rules will eventually catch it — the AI-before-rules "
            "story will not be visible. Re-enable via "
            "autonomy.ai_monitor.enabled and restart to restore."
        )
    return response


@router.post("/cancel")
def cancel_scenario(req: CancelRequest):
    """Cancel one active run by id. Triggers the ramp-down."""
    injector, _, _, _ = _deps()
    run = injector.cancel(req.run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Unknown run_id: {req.run_id}")
    return {"ok": True, "run": run.as_dict()}


@router.post("/reset")
def reset_demo():
    """
    Cancel all active scenarios immediately and clear the AI monitor's
    rolling buffer. Use between rehearsal runs so each scenario starts
    cleanly from a cold AI buffer.
    """
    injector, ai_monitor, _, timeline_buffer = _deps()
    n_cleared = injector.reset_all()
    if hasattr(ai_monitor, "reset"):
        ai_monitor.reset()
    timeline_buffer.clear()
    return {
        "ok": True,
        "scenarios_cleared": n_cleared,
        "ai_buffer_reset": True,
        "timeline_cleared": True,
    }


@router.get("/status")
def get_status():
    """Active runs + recently completed runs (for the panel summary view)."""
    injector, _, _, _ = _deps()
    return injector.status()


@router.get("/timeline")
def get_timeline(seconds: int = 300):
    """
    Last N seconds of (anomaly_score, rule alerts, autonomy mode,
    replan events). Time-aligned. Default 300 s (5 min). This is what
    DemoTimeline.jsx renders — the visual proof that the unified loop
    is closed within the same tick.
    """
    _, _, _, timeline_buffer = _deps()
    seconds = max(1, min(seconds, 1800))
    # The buffer is appended once per tick at 1 Hz, so seconds == samples
    samples = list(timeline_buffer)[-seconds:]
    return {
        "seconds_returned": len(samples),
        "samples": samples,
    }
