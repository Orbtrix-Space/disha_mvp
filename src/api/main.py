from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
import uuid

# Import Core Logic
from src.core.state_manager import MissionState
from src.core.flight_dynamics import check_feasibility
from src.core.mission_planner import generate_mission_plan
from src.models.schemas import UserRequest

# --- 1. Define Input Schema ---
class ScheduleRequest(BaseModel):
    requests: list[dict]

# --- 2. Initialize App & Global State ---
app = FastAPI(
    title="DISHA Mission Control API",
    description="Backend service for satellite orbit propagation and scheduling.",
    version="1.0.0"
)

# CORS Setup (Allows React Frontend to talk to this API)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GLOBAL SATELLITE INSTANCE
# We create this ONCE when the server starts.
# It will keep track of battery/storage as long as the server runs.
satellite = MissionState()

# --- 3. The Endpoints ---

@app.get("/")
def read_root():
    return {"system": "DISHA-SAT", "status": "ONLINE"}

@app.get("/satellite-status")
def get_satellite_status():
    """
    Returns the current live status (Battery, Storage, Position).
    """
    return satellite.get_state()

@app.post("/generate-plan")
def api_generate_plan(payload: ScheduleRequest):
    """
    Receives requests, calculates orbits, and updates the schedule.
    """
    print(f"[API] Received {len(payload.requests)} requests.")
    
    # A. Convert JSON to Internal Objects
    mission_requests = []
    base_time = datetime.now()
    
    for i, item in enumerate(payload.requests):
        req = UserRequest(
            request_id=f"REQ-{i+1:03d}",
            target_lat=item["lat"],
            target_lon=item["lon"],
            priority=item.get("priority", 5),
            window_start=base_time,
            window_end=base_time + timedelta(hours=24),
            min_duration_sec=60
        )
        mission_requests.append(req)

    # B. Run Physics (Using the Global Satellite)
    valid_requests = []
    for req in mission_requests:
        fd_result = check_feasibility(req, satellite)
        if fd_result["is_feasible"]:
            req.feasible_windows = fd_result["windows"]
            valid_requests.append(req)
            
    # C. Run Scheduler
    mission_plan = generate_mission_plan(valid_requests)
    
    # D. Update Satellite State (Drain Battery based on Plan)
    # For every scheduled task, we simulate the resource usage
    for task in mission_plan.schedule:
        satellite.update_state(task.power_cost_wh, task.data_cost_gb)

    return {
        "status": "SUCCESS",
        "scheduled_tasks": len(mission_plan.schedule),
        "satellite_health": satellite.get_state(),
        "plan_details": mission_plan.schedule
    }