"""
DISHA Beta — Mission Planner
Greedy scheduler, feasibility scoring, conflict detection.
Supports four task types: IMAGING, DOWNLINK, MANOEUVRE, CONTACT.
"""

from datetime import datetime, timedelta, timezone
from backend.models.schemas import MissionPlan, Task
from backend.core.flight_dynamics import predict_eclipse_simple
from backend.models.config import get_config


# Resource consumption models
POWER_W = {
    "IMAGING": 15.0,
    "DOWNLINK": 20.0,
    "MANOEUVRE": 12.0,
    "CONTACT": 10.0,
    "IDLE": 1.0,
}

DATA_RATE_GBPS = {
    "IMAGING": 0.5,
    "DOWNLINK": 0.0,
    "MANOEUVRE": 0.0,
    "CONTACT": 0.0,
}


def calculate_energy_cost(mode: str, duration_sec: float) -> float:
    """Energy consumed in Watt-hours."""
    hours = duration_sec / 3600.0
    return POWER_W.get(mode, POWER_W["IDLE"]) * hours


def calculate_data_volume(mode: str, duration_sec: float) -> float:
    """Data generated in GB."""
    return DATA_RATE_GBPS.get(mode, 0) * duration_sec


def check_temporal_overlap(new_start: datetime, new_end: datetime, existing_tasks: list) -> bool:
    """Returns True if time window overlaps with any existing task."""
    for task in existing_tasks:
        if new_start < task.end_time and new_end > task.start_time:
            return True
    return False


def generate_mission_plan(requests, mission_state=None) -> MissionPlan:
    """
    Greedy scheduler: sort by priority, check constraints, schedule.
    """
    sorted_requests = sorted(requests, key=lambda x: x.priority, reverse=True)
    scheduled_tasks = []
    rejected_count = 0

    for req in sorted_requests:
        if not hasattr(req, 'feasible_windows') or not req.feasible_windows:
            rejected_count += 1
            continue

        selected_window = None
        for window in req.feasible_windows:
            start_t, end_t = window
            if not check_temporal_overlap(start_t, end_t, scheduled_tasks):
                selected_window = window
                break

        if selected_window is None:
            rejected_count += 1
            continue

        start_time, end_time = selected_window
        duration = (end_time - start_time).total_seconds()
        action = getattr(req, 'task_type', 'IMAGING') if hasattr(req, 'task_type') else 'IMAGING'

        power_cost = calculate_energy_cost(action, duration)
        data_cost = calculate_data_volume(action, duration)

        new_task = Task(
            task_id=f"TASK-{req.request_id}",
            action=action,
            start_time=start_time,
            end_time=end_time,
            power_cost_wh=power_cost,
            data_cost_gb=data_cost,
        )
        scheduled_tasks.append(new_task)

    plan = MissionPlan(
        request_id="MASTER-PLAN-001",
        is_feasible=len(scheduled_tasks) > 0,
        reason=f"Scheduled {len(scheduled_tasks)}/{len(requests)} requests",
        schedule=scheduled_tasks,
    )

    return plan


def compute_feasibility(task: dict, mission_state, passes: list = None) -> dict:
    """
    Compute feasibility score for a scheduled task.
    Score = 0.50 × power + 0.25 × contact + 0.25 × sunlit
    """
    battery_pct = (mission_state.current_battery_wh / mission_state.battery_capacity_wh) * 100
    power_cost = task.get("power_cost_wh", 0)
    battery_after = battery_pct - (power_cost / mission_state.battery_capacity_wh * 100)

    # Power margin score
    if battery_after > 60:
        power_score = 1.0
    elif battery_after > 40:
        power_score = 0.8
    elif battery_after > 25:
        power_score = 0.5
    elif battery_after > 10:
        power_score = 0.2
    else:
        power_score = 0.0

    # Contact availability
    contact_score = 0.5
    if passes:
        task_start = task.get("start_time", "")
        task_end = task.get("end_time", "")
        if isinstance(task_start, str) and task_start:
            try:
                task_start_dt = datetime.fromisoformat(task_start.replace("Z", "+00:00"))
                task_end_dt = datetime.fromisoformat(task_end.replace("Z", "+00:00"))
                buffer = timedelta(minutes=30)
                for p in passes:
                    aos = datetime.fromisoformat(p["aos_time"].replace("Z", "+00:00"))
                    los = datetime.fromisoformat(p["los_time"].replace("Z", "+00:00"))
                    if aos <= task_end_dt + buffer and los >= task_start_dt - buffer:
                        contact_score = 1.0
                        break
            except (ValueError, KeyError):
                contact_score = 0.6

    # Sunlit score
    r_eci = mission_state.position.tolist() if hasattr(mission_state.position, 'tolist') else list(mission_state.position)
    in_eclipse = predict_eclipse_simple(r_eci)
    sunlit_score = 1.0 if not in_eclipse else 0.4

    score = round(0.50 * power_score + 0.25 * contact_score + 0.25 * sunlit_score, 2)

    if score >= 0.75:
        risk_level = "LOW"
    elif score >= 0.5:
        risk_level = "MEDIUM"
    else:
        risk_level = "HIGH"

    return {
        "task_id": task.get("task_id", ""),
        "target": task.get("task_id", "").replace("TASK-REQ-", "Target "),
        "feasibility_score": score,
        "risk_level": risk_level,
        "factors": {
            "power_margin": round(battery_after, 1),
            "contact_available": contact_score >= 0.8,
            "sunlit": not in_eclipse,
        },
    }


def detect_conflicts(tasks: list, mission_state) -> list:
    """Detect time, mode, and power conflicts between tasks."""
    conflicts = []
    battery_pct = (mission_state.current_battery_wh / mission_state.battery_capacity_wh) * 100

    for i, t1 in enumerate(tasks):
        start1 = t1.get("start_time", "")
        end1 = t1.get("end_time", "")
        if not start1 or not end1:
            continue

        start1_dt = _parse_dt(start1)
        end1_dt = _parse_dt(end1)
        if not start1_dt or not end1_dt:
            continue

        for j, t2 in enumerate(tasks):
            if j <= i:
                continue
            start2 = t2.get("start_time", "")
            end2 = t2.get("end_time", "")
            start2_dt = _parse_dt(start2)
            end2_dt = _parse_dt(end2)
            if not start2_dt or not end2_dt:
                continue

            # Time overlap
            if start1_dt < end2_dt and end1_dt > start2_dt:
                conflicts.append({
                    "conflict": True,
                    "type": "TIME_OVERLAP",
                    "tasks": [t1.get("task_id", f"task-{i}"), t2.get("task_id", f"task-{j}")],
                    "reason": f"Time overlap between {t1.get('task_id', '')} and {t2.get('task_id', '')}",
                    "severity": "WARNING",
                })

                # Mode conflict
                a1 = t1.get("action", "")
                a2 = t2.get("action", "")
                if (a1 == "IMAGING" and a2 == "DOWNLINK") or (a1 == "DOWNLINK" and a2 == "IMAGING"):
                    conflicts.append({
                        "conflict": True,
                        "type": "MODE_CONFLICT",
                        "tasks": [t1.get("task_id"), t2.get("task_id")],
                        "reason": "Imaging and downlink cannot run simultaneously",
                        "severity": "CRITICAL",
                    })

        # Power deficit check
        cumulative_cost = sum(t.get("power_cost_wh", 0) for t in tasks[:i + 1])
        projected_battery = battery_pct - (cumulative_cost / mission_state.battery_capacity_wh * 100)
        if projected_battery < 20:
            conflicts.append({
                "conflict": True,
                "type": "POWER_DEFICIT",
                "tasks": [t1.get("task_id", f"task-{i}")],
                "reason": f"Power deficit — projected battery: {projected_battery:.0f}%",
                "severity": "CRITICAL",
            })

    return conflicts


def _parse_dt(val):
    """Parse datetime from string or return datetime as-is."""
    if isinstance(val, datetime):
        return val
    if isinstance(val, str) and val:
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None
