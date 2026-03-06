"""
DISHA Beta — FastAPI Application Entry Point
Startup event, simulation loop orchestration, route registration.
"""

import asyncio
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.models.config import load_config
from backend.core.mission_state import MissionState
from backend.core.tle_manager import TLEManager
from backend.core.fdir_engine import FDIREngine
from backend.core.constraint_engine import evaluate_constraints
from backend.core.autonomy_manager import AutonomyManager
from backend.core.command_engine import CommandEngine
from backend.core.ground_stations import GroundStationPassPredictor
from backend.core.telemetry_manager import ConnectionManager, build_telemetry_frame


# ====================================================
# GLOBAL STATE (single in-memory objects)
# ====================================================

# Load configuration
load_config()

satellite = MissionState()
tle_manager = TLEManager()
fdir_engine = FDIREngine()
ws_manager = ConnectionManager()
pass_predictor = GroundStationPassPredictor()
command_engine = CommandEngine()
autonomy_manager = AutonomyManager()

satellite.tle_manager = tle_manager

# Intelligence cache (updated each tick, served by REST without recomputation)
intelligence_cache = {
    "constraints": {"risk_score": 0, "active_constraints": []},
    "autonomy": autonomy_manager.get_status(),
}


def reset_state():
    """Reset all systems to initial state."""
    global satellite
    satellite = MissionState()
    satellite.tle_manager = tle_manager
    fdir_engine.reset()
    command_engine.reset()
    autonomy_manager.reset()
    intelligence_cache["constraints"] = {"risk_score": 0, "active_constraints": []}
    intelligence_cache["autonomy"] = autonomy_manager.get_status()


# ====================================================
# SIMULATION LOOP (1 Hz)
# ====================================================

async def telemetry_loop():
    """Background task: tick state + build telemetry + broadcast at 1 Hz."""
    while True:
        try:
            # 1. Advance simulation by 1 second
            satellite.tick(dt_seconds=1.0)
            raw_state = satellite.get_state()

            # 2. FDIR evaluation (self-clearing)
            alerts = fdir_engine.evaluate(raw_state)

            # 3. Constraint engine
            constraint_result = evaluate_constraints(raw_state)
            intelligence_cache["constraints"] = constraint_result

            # 4. Autonomy manager
            autonomy_result = autonomy_manager.evaluate(raw_state, constraint_result)
            intelligence_cache["autonomy"] = autonomy_result

            # 5. Build telemetry frame
            frame = build_telemetry_frame(raw_state, alerts)

            # 6. Broadcast to all WebSocket clients
            await ws_manager.broadcast({
                "telemetry": frame,
                "alerts": alerts,
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

app.include_router(core_router)
app.include_router(tle_router)
app.include_router(flight_router)
app.include_router(fdir_router)
app.include_router(planning_router)
app.include_router(intelligence_router)
app.include_router(ws_router)
