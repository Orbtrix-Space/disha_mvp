"""
Scheduler Enhancer for DISHA MVP.
Adds task feasibility scoring and conflict detection to the planner output.
"""

from datetime import datetime, timezone
from src.core.power_prediction import predict_eclipse


def compute_feasibility(task: dict, mission_state, passes: list = None) -> dict:
    """
    Compute feasibility score for a scheduled task.

    Factors:
    - Power margin (battery after task cost)
    - Contact availability (is there a pass during/near the task window?)
    - Sunlit condition (is the satellite in sunlight during the task?)

    Returns:
        {
            "task_id": str,
            "target": str,
            "feasibility_score": float (0-1),
            "risk_level": "LOW" | "MEDIUM" | "HIGH",
            "factors": {
                "power_margin": float,
                "contact_available": bool,
                "sunlit": bool,
            }
        }
    """
    battery_pct = (mission_state.current_battery_wh / mission_state.MAX_BATTERY_WH) * 100
    power_cost = task.get("power_cost_wh", 0)
    battery_after = battery_pct - (power_cost / mission_state.MAX_BATTERY_WH * 100)

    # Power margin score (0-1)
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

    # Contact availability score
    contact_score = 0.5  # default: unknown
    if passes:
        task_start = task.get("start_time", "")
        task_end = task.get("end_time", "")
        if isinstance(task_start, str) and task_start:
            task_start_dt = datetime.fromisoformat(task_start.replace("Z", "+00:00"))
            task_end_dt = datetime.fromisoformat(task_end.replace("Z", "+00:00"))

            for p in passes:
                aos = datetime.fromisoformat(p["aos_time"].replace("Z", "+00:00"))
                los = datetime.fromisoformat(p["los_time"].replace("Z", "+00:00"))
                # Check if any pass overlaps within 30 min of task window
                from datetime import timedelta
                buffer = timedelta(minutes=30)
                if aos <= task_end_dt + buffer and los >= task_start_dt - buffer:
                    contact_score = 1.0
                    break
        else:
            contact_score = 0.6

    # Sunlit score (check if satellite is in sunlight now)
    r_eci = mission_state.position.tolist()
    in_eclipse = predict_eclipse(r_eci)
    sunlit = not in_eclipse
    sunlit_score = 1.0 if sunlit else 0.4

    # Weighted feasibility
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
            "sunlit": sunlit,
        },
    }


def detect_conflicts(tasks: list, mission_state) -> list:
    """
    Detect conflicts between scheduled tasks.

    Checks:
    - Time overlap between tasks
    - Imaging overlapping downlink
    - Battery projected below threshold during task window

    Returns list of conflict dicts.
    """
    conflicts = []
    battery_pct = (mission_state.current_battery_wh / mission_state.MAX_BATTERY_WH) * 100

    for i, t1 in enumerate(tasks):
        start1 = t1.get("start_time", "")
        end1 = t1.get("end_time", "")
        if not start1 or not end1:
            continue

        # Parse times
        if isinstance(start1, str):
            start1_dt = datetime.fromisoformat(start1.replace("Z", "+00:00"))
            end1_dt = datetime.fromisoformat(end1.replace("Z", "+00:00"))
        else:
            start1_dt = start1
            end1_dt = end1

        # Check against other tasks
        for j, t2 in enumerate(tasks):
            if j <= i:
                continue
            start2 = t2.get("start_time", "")
            end2 = t2.get("end_time", "")
            if not start2 or not end2:
                continue

            if isinstance(start2, str):
                start2_dt = datetime.fromisoformat(start2.replace("Z", "+00:00"))
                end2_dt = datetime.fromisoformat(end2.replace("Z", "+00:00"))
            else:
                start2_dt = start2
                end2_dt = end2

            # Time overlap check
            if start1_dt < end2_dt and end1_dt > start2_dt:
                conflicts.append({
                    "conflict": True,
                    "type": "TIME_OVERLAP",
                    "tasks": [t1.get("task_id", f"task-{i}"), t2.get("task_id", f"task-{j}")],
                    "reason": f"Time overlap between {t1.get('task_id', '')} and {t2.get('task_id', '')}",
                    "severity": "WARNING",
                })

            # Imaging + Downlink overlap
            a1 = t1.get("action", "")
            a2 = t2.get("action", "")
            if start1_dt < end2_dt and end1_dt > start2_dt:
                if (a1 == "IMAGING" and a2 == "DOWNLINK") or (a1 == "DOWNLINK" and a2 == "IMAGING"):
                    conflicts.append({
                        "conflict": True,
                        "type": "MODE_CONFLICT",
                        "tasks": [t1.get("task_id"), t2.get("task_id")],
                        "reason": "Imaging and downlink cannot run simultaneously",
                        "severity": "CRITICAL",
                    })

        # Battery depletion check
        cumulative_cost = sum(t.get("power_cost_wh", 0) for t in tasks[:i + 1])
        projected_battery = battery_pct - (cumulative_cost / mission_state.MAX_BATTERY_WH * 100)
        if projected_battery < 20:
            conflicts.append({
                "conflict": True,
                "type": "POWER_DEFICIT",
                "tasks": [t1.get("task_id", f"task-{i}")],
                "reason": f"Power deficit during {t1.get('task_id', '')} — projected battery: {projected_battery:.0f}%",
                "severity": "CRITICAL",
            })

    return conflicts
