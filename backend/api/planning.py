"""
DISHA Beta — Planning & Commands API Routes
POST /generate-plan, GET /power/prediction, GET /commands, POST /commands/{id}/approve
"""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter
from backend.models.schemas import ScheduleRequest, UserRequest
from backend.core.flight_dynamics import check_feasibility
from backend.core.mission_planner import generate_mission_plan, compute_feasibility, detect_conflicts
from backend.core.power_module import predict_power

router = APIRouter(tags=["Planning"])


def get_deps():
    from backend.main import satellite, command_engine, pass_predictor
    return satellite, command_engine, pass_predictor


@router.post("/generate-plan")
def api_generate_plan(payload: ScheduleRequest):
    satellite, command_engine, pass_predictor = get_deps()

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

    mission_plan = generate_mission_plan(valid_requests, satellite)

    for task in mission_plan.schedule:
        satellite.update_state(task.power_cost_wh, task.data_cost_gb)

    # Generate telecommand sequence
    command_sequence_id = None
    if mission_plan.schedule:
        seq = command_engine.generate_sequence(
            [{"task_id": t.task_id, "action": t.action,
              "start_time": t.start_time.isoformat(),
              "end_time": t.end_time.isoformat(),
              "power_cost_wh": round(t.power_cost_wh, 2),
              "data_cost_gb": round(t.data_cost_gb, 2)}
             for t in mission_plan.schedule]
        )
        command_sequence_id = seq["sequence_id"]

    plan_details = [
        {
            "task_id": t.task_id,
            "action": t.action,
            "start_time": t.start_time.isoformat(),
            "end_time": t.end_time.isoformat(),
            "power_cost_wh": round(t.power_cost_wh, 2),
            "data_cost_gb": round(t.data_cost_gb, 2),
        }
        for t in mission_plan.schedule
    ]

    try:
        passes = pass_predictor.compute_passes(satellite, duration_hours=24.0)
    except Exception:
        passes = []

    feasibility_scores = []
    for task_detail in plan_details:
        score = compute_feasibility(task_detail, satellite, passes)
        feasibility_scores.append(score)

    conflicts = detect_conflicts(plan_details, satellite)

    return {
        "status": "SUCCESS",
        "scheduled_tasks": len(mission_plan.schedule),
        "total_requests": len(payload.requests),
        "feasible_requests": len(valid_requests),
        "satellite_health": satellite.get_state(),
        "command_sequence_id": command_sequence_id,
        "plan_details": plan_details,
        "feasibility_scores": feasibility_scores,
        "conflicts": conflicts,
    }


@router.get("/power/prediction")
def get_power_prediction():
    satellite, command_engine, _ = get_deps()
    try:
        scheduled_tasks = []
        sequences = command_engine.get_all_sequences()
        for seq in sequences:
            if not seq.get("approved"):
                continue
            seen_tasks = {}
            for cmd in seq.get("commands", []):
                tid = cmd.get("task_id", "")
                if tid not in seen_tasks:
                    action = cmd.get("parameters", {}).get("task_action", "IMAGING")
                    seen_tasks[tid] = action
            task_list = list(seen_tasks.values())
            if task_list:
                spacing = 90 // max(len(task_list), 1)
                for i, action in enumerate(task_list):
                    scheduled_tasks.append({
                        "action": action,
                        "start_min": i * spacing + 5,
                        "duration_min": 5 if action == "IMAGING" else 8,
                    })

        prediction = predict_power(satellite, duration_minutes=90, step_minutes=1,
                                   scheduled_tasks=scheduled_tasks if scheduled_tasks else None)
        return prediction
    except Exception as e:
        return {"error": str(e), "prediction_points": [], "min_soc_pct": 0, "power_margin_wh": 0}


@router.get("/commands")
def get_commands():
    _, command_engine, _ = get_deps()
    return {"sequences": command_engine.get_all_sequences()}


@router.get("/commands/log")
def get_command_log():
    _, command_engine, _ = get_deps()
    return {"log": command_engine.get_log()}


@router.get("/commands/{sequence_id}")
def get_command_sequence(sequence_id: str):
    _, command_engine, _ = get_deps()
    seq = command_engine.get_sequence(sequence_id)
    if seq is None:
        return {"status": "ERROR", "message": "Sequence not found"}
    return seq


@router.post("/commands/{sequence_id}/approve")
def approve_commands(sequence_id: str):
    _, command_engine, _ = get_deps()
    return command_engine.approve_sequence(sequence_id)


@router.post("/commands/send")
def send_adhoc_command(payload: dict):
    """Execute an ad-hoc operator command against the satellite state."""
    satellite, command_engine, _ = get_deps()
    cmd = payload.get("command", "").strip().upper()
    if not cmd:
        return {"status": "ERROR", "message": "Empty command"}

    result = {"status": "EXECUTED", "command": cmd, "effect": ""}

    if cmd == "SAFE MODE":
        satellite.attitude_mode = "SAFE"
        result["effect"] = "Satellite switched to SAFE mode"
    elif cmd == "PAYLOAD ON":
        satellite.payload_status = "ACTIVE"
        result["effect"] = "Payload activated"
    elif cmd == "PAYLOAD OFF":
        satellite.payload_status = "IDLE"
        result["effect"] = "Payload deactivated"
    elif cmd == "ATTITUDE NADIR":
        satellite.attitude_mode = "NADIR"
        result["effect"] = "Attitude set to NADIR pointing"
    elif cmd == "ATTITUDE SUN":
        satellite.attitude_mode = "SUN_TRACKING"
        result["effect"] = "Attitude set to SUN_TRACKING"
    elif cmd == "TX HIGH":
        satellite.data_rate_kbps = 512.0
        result["effect"] = "High-gain transmitter enabled (512 kbps)"
    elif cmd == "TX LOW":
        satellite.data_rate_kbps = 64.0
        result["effect"] = "Low-power transmitter enabled (64 kbps)"
    elif cmd == "HEATER ON":
        satellite.heater_active = True
        result["effect"] = "Battery heater enabled"
    elif cmd == "HEATER OFF":
        satellite.heater_active = False
        result["effect"] = "Battery heater disabled"
    else:
        result["status"] = "UNKNOWN"
        result["effect"] = f"Unrecognized command: {cmd}"

    # Log the command
    command_engine.log_command(cmd, result["status"])

    return result
