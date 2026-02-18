import asyncio
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.core.state_manager import MissionState
from src.core.tle_manager import TLEManager
from src.core.flight_dynamics import check_feasibility
from src.core.flight_dynamics.propagator import propagate_orbit
from src.core.flight_dynamics.transforms import eci_to_ecef, ecef_to_lla
from src.core.mission_planner import generate_mission_plan
from src.core.telemetry import ConnectionManager, build_telemetry_frame
from src.core.fdir.engine import FDIREngine
from src.core.relnav import compute_relative_state
from src.core.orbital_elements import state_to_keplerian
from src.core.ground_stations import GroundStationPassPredictor, GROUND_STATIONS
from src.core.conjunction import ConjunctionAnalyzer
from src.models.schemas import UserRequest


# --- Input Schemas ---
class ScheduleRequest(BaseModel):
    requests: list[dict]

class TLELoadRequest(BaseModel):
    norad_id: int

class RelNavRequest(BaseModel):
    primary_state: dict
    secondary_state: dict


# --- Global State ---
satellite = MissionState()
tle_manager = TLEManager()
fdir_engine = FDIREngine()
ws_manager = ConnectionManager()
pass_predictor = GroundStationPassPredictor()
conjunction_analyzer = ConjunctionAnalyzer()

satellite.tle_manager = tle_manager


# --- Background Telemetry Loop ---
async def telemetry_loop():
    while True:
        try:
            satellite.tick(dt_seconds=1.0)
            raw_state = satellite.get_state()
            frame = build_telemetry_frame(raw_state)
            alerts = fdir_engine.check(frame)
            await ws_manager.broadcast({
                "telemetry": frame,
                "alerts": alerts,
            })
        except Exception as e:
            print(f"[TELEMETRY LOOP ERROR] {e}")
        await asyncio.sleep(1.0)


# --- App Lifecycle ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(telemetry_loop())
    print("[STARTUP] Telemetry broadcast loop started (1 Hz)")
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


# --- App Init ---
app = FastAPI(
    title="DISHA Mission Control API",
    description="Unified satellite mission control backend.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========================================
# REST Endpoints
# ========================================

@app.get("/")
def read_root():
    return {
        "system": "DISHA-SAT",
        "status": "ONLINE",
        "ws_clients": ws_manager.client_count,
        "tle_loaded": tle_manager.satrec is not None,
    }


@app.get("/satellite-status")
def get_satellite_status():
    return satellite.get_state()


@app.post("/generate-plan")
def api_generate_plan(payload: ScheduleRequest):
    print(f"[API] Received {len(payload.requests)} requests.")

    mission_requests = []
    base_time = datetime.now(timezone.utc)

    for i, item in enumerate(payload.requests):
        req = UserRequest(
            request_id=f"REQ-{i+1:03d}",
            target_lat=item["lat"],
            target_lon=item["lon"],
            priority=item.get("priority", 5),
            window_start=base_time,
            window_end=base_time + timedelta(hours=24),
            min_duration_sec=60,
        )
        mission_requests.append(req)

    valid_requests = []
    for req in mission_requests:
        fd_result = check_feasibility(req, satellite)
        if fd_result["is_feasible"]:
            req.feasible_windows = fd_result["windows"]
            valid_requests.append(req)

    mission_plan = generate_mission_plan(valid_requests)

    for task in mission_plan.schedule:
        satellite.update_state(task.power_cost_wh, task.data_cost_gb)

    return {
        "status": "SUCCESS",
        "scheduled_tasks": len(mission_plan.schedule),
        "total_requests": len(payload.requests),
        "feasible_requests": len(valid_requests),
        "satellite_health": satellite.get_state(),
        "plan_details": [
            {
                "task_id": t.task_id,
                "action": t.action,
                "start_time": t.start_time.isoformat(),
                "end_time": t.end_time.isoformat(),
                "power_cost_wh": round(t.power_cost_wh, 2),
                "data_cost_gb": round(t.data_cost_gb, 2),
            }
            for t in mission_plan.schedule
        ],
    }


@app.post("/reset")
def reset_satellite():
    global satellite
    satellite = MissionState()
    satellite.tle_manager = tle_manager
    fdir_engine.reset()
    return {"status": "RESET", "satellite_health": satellite.get_state()}


# ========================================
# TLE Endpoints
# ========================================

@app.post("/tle/load")
async def load_tle(payload: TLELoadRequest):
    try:
        info = await tle_manager.fetch_tle(payload.norad_id)
        global satellite
        satellite = MissionState()
        satellite.tle_manager = tle_manager
        satellite.current_time = datetime.now(timezone.utc)
        pos, vel = tle_manager.propagate_at(satellite.current_time)
        import numpy as np
        satellite.position = np.array(pos)
        satellite.velocity = np.array(vel)
        fdir_engine.reset()
        return {"status": "SUCCESS", "tle": info}
    except Exception as e:
        return {"status": "ERROR", "message": str(e)}


@app.get("/tle/current")
def get_current_tle():
    return tle_manager.get_tle_info()


# ========================================
# FDIR Endpoints
# ========================================

@app.get("/fdir/alerts")
def get_fdir_alerts():
    return {"alerts": fdir_engine.get_history()}


@app.get("/fdir/status")
def get_fdir_status():
    return fdir_engine.get_status()


# ========================================
# Relative Navigation
# ========================================

@app.post("/relnav/compute")
def compute_relnav(payload: RelNavRequest):
    return compute_relative_state(payload.primary_state, payload.secondary_state)


# ========================================
# Orbit Prediction
# ========================================

@app.get("/orbit/prediction")
def get_orbit_prediction():
    points = []

    if tle_manager.satrec:
        now = satellite.current_time
        for i in range(0, 5400, 60):
            dt = now + timedelta(seconds=i)
            try:
                pos, vel = tle_manager.propagate_at(dt)
                r_ecef = eci_to_ecef(pos, dt)
                lla = ecef_to_lla(r_ecef)
                points.append({
                    "lat": round(lla["lat"], 4),
                    "lon": round(lla["lon"], 4),
                    "alt_km": round(lla["alt_km"], 1),
                })
            except Exception:
                break
    else:
        initial_state = {
            "position": satellite.position,
            "velocity": satellite.velocity,
            "epoch": satellite.current_time,
        }
        trajectory = propagate_orbit(initial_state, 5400, step_size=60)
        for step in trajectory:
            r_eci = step["eci_state"][:3]
            dt = satellite.current_time + timedelta(seconds=int(step["time_offset"]))
            r_ecef = eci_to_ecef(r_eci, dt)
            lla = ecef_to_lla(r_ecef)
            points.append({
                "lat": round(lla["lat"], 4),
                "lon": round(lla["lon"], 4),
                "alt_km": round(lla["alt_km"], 1),
            })

    return {"points": points}


# ========================================
# Flight Dynamics
# ========================================

@app.get("/flight/orbital-elements")
def get_orbital_elements():
    return state_to_keplerian(satellite.position.tolist(), satellite.velocity.tolist())


@app.get("/flight/passes")
def get_passes():
    try:
        passes = pass_predictor.compute_passes(satellite, duration_hours=24.0)
        return {"passes": passes}
    except Exception as e:
        return {"passes": [], "error": str(e)}


@app.get("/flight/conjunction")
def get_conjunction():
    state = satellite.get_state()
    events = conjunction_analyzer.assess(state)
    return {"events": events}


@app.get("/flight/ground-stations")
def get_ground_stations():
    return {"stations": GROUND_STATIONS}


# ========================================
# WebSocket
# ========================================

@app.websocket("/ws/telemetry")
async def websocket_telemetry(ws: WebSocket):
    await ws_manager.connect(ws)
    print(f"[WS] Client connected. Total: {ws_manager.client_count}")
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
        print(f"[WS] Client disconnected. Total: {ws_manager.client_count}")
