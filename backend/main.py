"""
DISHA Beta — FastAPI Application Entry Point
Startup event, simulation loop orchestration, route registration.
"""

import asyncio
from collections import deque
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.shared.models.config import load_config
from backend.shared.state.mission_state import MissionState
from backend.shared.tle.manager import TLEManager
from backend.fdir.engine import FDIREngine
from backend.fdir.ai_monitor import AIMonitor
from backend.shared.constraints import evaluate_constraints
from backend.control.autonomy import AutonomyManager
from backend.shared.commands import CommandEngine
from backend.control.demo_scenarios import DemoScenarioInjector
from backend.flight.pipeline import FlightPipeline
from backend.shared.ground.stations import GroundStationPassPredictor, check_contact_now
from backend.shared.state.telemetry_manager import ConnectionManager, build_telemetry_frame
from backend.shared.state.telemetry_recorder import TelemetryRecorder


# ====================================================
# GLOBAL STATE (single in-memory objects)
# ====================================================

# Load configuration
load_config()

satellite = MissionState()
tle_manager = TLEManager()
fdir_engine = FDIREngine()
ai_monitor = AIMonitor()
ws_manager = ConnectionManager()
pass_predictor = GroundStationPassPredictor()
command_engine = CommandEngine()
autonomy_manager = AutonomyManager()
telemetry_recorder = TelemetryRecorder()
demo_injector = DemoScenarioInjector()
flight_pipeline = FlightPipeline()

# Constellation tasking (NEXUS-style) state. Holds in-memory mission +
# target deck + last optimizer result. Initialised with a sample deck
# whose windows are anchored to "now" so the default horizon contains
# them — otherwise every metric reads 0 % and the demo looks broken.
from backend.schedule.state import SchedulerState  # noqa: E402
scheduler_state = SchedulerState()

# MONITOR rolling 24h history — feeds the NETRA analytics view +
# context for the NETRA chat. Recorded each tick after FDIR + autonomy.
from backend.fdir.history import MonitorHistory  # noqa: E402
monitor_history = MonitorHistory()

# 5 minutes of per-tick samples for the demo timeline endpoint
demo_timeline_buffer: deque = deque(maxlen=300)
# Track which rule_ids were active last tick, so we can detect NEW alerts
_prev_alert_ids: set[str] = set()

satellite.tle_manager = tle_manager

# Intelligence cache (updated each tick, served by REST without recomputation).
# The unified loop writes both the rule-based and AI signals here so any
# REST endpoint or component can read a coherent snapshot of the same tick.
intelligence_cache = {
    "constraints": {"risk_score": 0, "active_constraints": []},
    "autonomy": autonomy_manager.get_status(),
    "ai_monitor": {
        "anomaly_score": 0.0,
        "flagged_subsystems": [],
        "reconstruction_errors": {},
        "confidence": "unavailable",
        "model_loaded": False,
        "param_count": 0,
        "sequence_filled": False,
    },
    "last_replan": None,
}


def reset_state():
    """Reset all systems to initial state."""
    global satellite
    satellite = MissionState()
    satellite.tle_manager = tle_manager
    fdir_engine.reset()
    ai_monitor.reset()
    command_engine.reset()
    autonomy_manager.reset()
    intelligence_cache["constraints"] = {"risk_score": 0, "active_constraints": []}
    intelligence_cache["autonomy"] = autonomy_manager.get_status()
    intelligence_cache["ai_monitor"] = {
        "anomaly_score": 0.0,
        "flagged_subsystems": [],
        "reconstruction_errors": {},
        "confidence": "unavailable",
        "model_loaded": False,
        "param_count": 0,
        "sequence_filled": False,
    }
    intelligence_cache["last_replan"] = None
    demo_injector.reset_all()
    demo_timeline_buffer.clear()
    global _prev_alert_ids
    _prev_alert_ids = set()


# ====================================================
# SIMULATION LOOP (1 Hz)
# ====================================================

async def telemetry_loop():
    """Unified 1 Hz tick — closed-loop architecture inside one frame.

    Order is deliberate; everything below runs against the same telemetry
    snapshot before broadcast:
        1. tick simulation                  (SGP4 + J2 + subsystems)
        2. contact check                    (8 ground stations)
        3. rule-based FDIR                  (deterministic backstop)
        4. AI anomaly monitor               (early-warning augmentation)
        5. constraint engine                (risk_score)
        6. shared state write               (satellite + intelligence_cache)
        7. autonomy.evaluate(rules + AI)    (mode + objective)
        8. re-plan if mode/objective changed (command queue update)
        9. build TelemetryFrame + broadcast

    Simulation always runs. During contact: live telemetry + buffer dump
    on AOS. During blackout: buffer onboard, broadcast PREDICTED frame
    so the frontend stays connected.
    """
    while True:
        try:
            # 1. Advance simulation by 1 second
            satellite.tick(dt_seconds=1.0)
            raw_state = satellite.get_state()

            # 2. Ground station contact
            contact = check_contact_now(
                satellite.position.tolist(), satellite.current_time
            )
            contact_acquired = satellite.update_contact(
                contact["in_contact"], contact["station"], contact["elevation_deg"]
            )
            raw_state = satellite.get_state()  # comms fields changed

            # 2b. Demo scenario overlay — applies deltas to the telemetry
            # dict BEFORE FDIR/AI see it. Underlying simulator state is
            # untouched, so cancelling a scenario returns the system to
            # nominal on the next tick without an orbit/power reset.
            demo_injector.step(dt=1.0)
            raw_state = demo_injector.apply(raw_state)

            # 3. Rule-based FDIR (deterministic backstop)
            alerts = fdir_engine.evaluate(raw_state)

            # 4. AI anomaly monitor (early-warning augmentation layer)
            #    update() appends to the rolling 60-sample buffer;
            #    evaluate() runs one forward pass and returns the
            #    Pydantic result. We dump to dict for downstream code
            #    that still works in plain dicts (autonomy, frame).
            ai_monitor.update(raw_state)
            ai_result_obj = ai_monitor.evaluate()
            ai_result = ai_result_obj.model_dump()
            # Keep the rich flagged-subsystem objects under a separate
            # key for the unified UI, and expose a name-only list under
            # the original key so autonomy_manager and the frame schema
            # (List[str]) keep working without changes.
            ai_result["flagged_subsystems_detail"] = ai_result["flagged_subsystems"]
            ai_result["flagged_subsystems"] = [
                fs["subsystem"] for fs in ai_result["flagged_subsystems_detail"]
            ]
            ai_result["confidence"] = ai_result.get("model_confidence", "unavailable")

            # 5. Constraint engine — rule-based risk_score
            constraint_result = evaluate_constraints(raw_state)

            # 6. Shared state write — single source of truth for this tick.
            # Both signals land on mission state and intelligence_cache so
            # autonomy, planner, REST endpoints, and the frame builder
            # all read coherent values for the same instant.
            satellite.risk_score = constraint_result.get("risk_score", 0.0)
            satellite.anomaly_score = ai_result.get("anomaly_score", 0.0)
            satellite.ai_flagged_subsystems = list(
                ai_result.get("flagged_subsystems") or []
            )
            intelligence_cache["constraints"] = constraint_result
            intelligence_cache["ai_monitor"] = ai_result

            # Predictions for temporal awareness
            predictions = {}
            try:
                from backend.shared.power import project_power
                power_proj = project_power(satellite)
                predictions["time_to_next_eclipse_min"] = power_proj.get(
                    "time_to_next_eclipse_min", 999
                )
            except Exception:
                pass

            # Upcoming approved tasks
            upcoming_tasks = []
            try:
                for seq in command_engine.get_all_sequences():
                    if seq.get("status") == "APPROVED":
                        upcoming_tasks.extend(seq.get("commands", []))
            except Exception:
                pass

            # 7. Autonomy — consumes both rules and AI in the same call
            prev_mode = autonomy_manager.mode
            prev_objective = autonomy_manager.current_objective

            autonomy_result = autonomy_manager.evaluate(
                raw_state, constraint_result,
                ai_result=ai_result,
                upcoming_tasks=upcoming_tasks or None,
                predictions=predictions or None,
            )
            intelligence_cache["autonomy"] = autonomy_result

            # 7b. Demo: record what AI / rules / autonomy saw this tick
            # on every active scenario (live "AI caught at T+X" stamps).
            global _prev_alert_ids
            current_alert_ids = {a.get("rule_id") for a in alerts}
            new_alert_ids = list(current_alert_ids - _prev_alert_ids)
            demo_injector.record_observation(
                anomaly_score=float(ai_result.get("anomaly_score", 0.0) or 0.0),
                new_rule_alert_ids=new_alert_ids,
                autonomy_mode_changed=(autonomy_manager.mode != prev_mode),
            )
            _prev_alert_ids = current_alert_ids

            # MONITOR history — per-tick snapshot + new-rule-firing events.
            try:
                monitor_history.record(
                    telemetry=raw_state, alerts=alerts,
                    autonomy=autonomy_result, constraints=constraint_result,
                    ai_result=ai_result,
                )
                for a in alerts:
                    if a.get("rule_id") in new_alert_ids:
                        monitor_history.record_alert(a, source="rule")
                if autonomy_manager.mode != prev_mode:
                    monitor_history.record_mode_change(
                        prev_mode, autonomy_manager.mode,
                        reason=autonomy_result.get("last_decision", {}).get("reason", "")
                            if isinstance(autonomy_result.get("last_decision"), dict) else "",
                    )
            except Exception:
                pass

            # 8. Re-plan in the same tick if autonomy changed mode/objective
            mode_changed = autonomy_manager.mode != prev_mode
            objective_changed = autonomy_manager.current_objective != prev_objective
            replan_summary = None
            if mode_changed or objective_changed:
                replan_summary = command_engine.replan_on_autonomy_change(
                    new_mode=autonomy_manager.mode,
                    new_objective=autonomy_manager.current_objective,
                    previous_mode=prev_mode,
                    previous_objective=prev_objective,
                )
                if replan_summary.get("triggered"):
                    ai_driven = (
                        ai_result.get("anomaly_score", 0.0)
                        >= autonomy_manager.ai_min_anomaly
                    )
                    replan_summary["ai_driven"] = ai_driven
                    replan_summary["timestamp"] = (
                        datetime.now(timezone.utc).isoformat()
                    )
                    intelligence_cache["last_replan"] = dict(replan_summary)
                    print(
                        f"[REPLAN] mode={prev_mode}->{autonomy_manager.mode}"
                        f" obj={prev_objective}->{autonomy_manager.current_objective}"
                        f" ai_driven={ai_driven}"
                    )

            # 9. Build + broadcast frame
            if contact["in_contact"]:
                # On AOS: dump any buffered blackout frames first
                if contact_acquired:
                    buffer = satellite.dump_buffer()
                    if buffer:
                        await ws_manager.broadcast({
                            "type": "buffer_dump",
                            "frames": [
                                build_telemetry_frame(s, source="BUFFERED")
                                for s in buffer
                            ],
                            "count": len(buffer),
                        })
                        print(
                            f"[CONTACT] {contact['station']} — dumped "
                            f"{len(buffer)} buffered frames"
                        )

                frame = build_telemetry_frame(
                    raw_state, alerts, source="LIVE",
                    ai_result=ai_result,
                    autonomy_snapshot=autonomy_result,
                    replan_summary=replan_summary,
                )
                telemetry_recorder.record(frame, source="LIVE", alerts=alerts)
                await ws_manager.broadcast({
                    "type": "telemetry",
                    "telemetry": frame,
                    "alerts": alerts,
                })
            else:
                # Blackout: buffer onboard, still broadcast a PREDICTED frame
                satellite.buffer_telemetry(raw_state)

                frame = build_telemetry_frame(
                    raw_state, alerts, source="PREDICTED",
                    ai_result=ai_result,
                    autonomy_snapshot=autonomy_result,
                    replan_summary=replan_summary,
                )
                telemetry_recorder.record(frame, source="PREDICTED", alerts=alerts)
                await ws_manager.broadcast({
                    "type": "telemetry",
                    "telemetry": frame,
                    "alerts": alerts,
                })

            # 10. Demo timeline sample — last 5 minutes of the unified loop.
            # Recorded each tick so /demo/timeline can render anomaly_score
            # as a line, rule alerts as markers, autonomy mode as bands,
            # and replan events as vertical strokes — all time-aligned.
            demo_timeline_buffer.append({
                "t": satellite.current_time.isoformat(),
                "anomaly_score": float(ai_result.get("anomaly_score", 0.0) or 0.0),
                "risk_score": float(constraint_result.get("risk_score", 0.0) or 0.0),
                "combined_risk_score": float(autonomy_result.get("combined_risk_score", 0.0) or 0.0),
                "autonomy_mode": autonomy_manager.mode,
                "autonomy_objective": autonomy_manager.current_objective,
                "mode_changed": mode_changed,
                "objective_changed": objective_changed,
                "replan_triggered": bool(replan_summary and replan_summary.get("triggered")),
                "rule_alert_ids": list(current_alert_ids),
                "new_rule_alert_ids": list(new_alert_ids),
                "ai_flagged_subsystems": list(ai_result.get("flagged_subsystems") or []),
                "active_scenarios": [
                    {
                        "run_id": r["run_id"],
                        "scenario_id": r["scenario_id"],
                        "elapsed_sec": r["elapsed_sec"],
                        "state": r["state"],
                    }
                    for r in demo_injector.active_scenarios()
                ],
            })

        except Exception as e:
            print(f"[TELEMETRY LOOP ERROR] {e}")
        await asyncio.sleep(1.0)


# ====================================================
# APP LIFECYCLE
# ====================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(telemetry_loop())
    print("[STARTUP] DISHA Beta — Telemetry broadcast loop started (1 Hz)")
    print(f"[STARTUP] Simulation epoch: {satellite.current_time.isoformat()}")
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


# ====================================================
# FASTAPI APP
# ====================================================

app = FastAPI(
    title="DISHA Beta — Mission Control API",
    description="Digital Infrastructure for Spacecraft Handling and Analytics",
    version="Beta",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route modules
from backend.api.core import router as core_router
from backend.api.tle import router as tle_router
from backend.api.flight import router as flight_router
from backend.api.fdir import router as fdir_router
from backend.api.planning import router as planning_router
from backend.api.intelligence import router as intelligence_router
from backend.api.websocket import router as ws_router
from backend.api.recorder import router as recorder_router
from backend.api.demo import router as demo_router
from backend.api.uploads import router as uploads_router
from backend.api.flight_pipeline import router as flight_pipeline_router
from backend.api.scheduler import router as scheduler_router
from backend.api.monitor import router as monitor_router

app.include_router(core_router)
app.include_router(tle_router)
app.include_router(flight_router)
app.include_router(fdir_router)
app.include_router(planning_router)
app.include_router(intelligence_router)
app.include_router(ws_router)
app.include_router(recorder_router)
app.include_router(demo_router)
app.include_router(uploads_router)
app.include_router(flight_pipeline_router)
app.include_router(scheduler_router)
app.include_router(monitor_router)
