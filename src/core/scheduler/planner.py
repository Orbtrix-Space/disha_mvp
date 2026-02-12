from src.models.schemas import Task, MissionPlan
from src.core.scheduler.constraints import check_temporal_overlap
from src.models.resources import calculate_energy_cost, calculate_data_volume
 
def generate_schedule(requests, fd_interface=None):
    """
    The 'Greedy' Scheduler.
    1. Sorts by Priority.
    2. Checks Constraints (Overlap).
    3. Commits to Schedule.
    """
    print(f"[SCHEDULER] Processing {len(requests)} requests...")

    # 1. Sort Requests (Highest Priority First)
    sorted_requests = sorted(requests, key=lambda x: x.priority, reverse=True)
    master_schedule = []
    rejected_count = 0

    for req in sorted_requests:
        # Check if Physics found a valid window
        if not hasattr(req, 'feasible_windows') or not req.feasible_windows:
            print(f"   [X] REJECTED: {req.request_id} (No Access Window)")
            rejected_count += 1
            continue
 
        # For Week 3 MVP, we pick the FIRST available window
        best_window = req.feasible_windows[0]
        start_time, end_time = best_window
        duration = (end_time - start_time).total_seconds()

        # 2. Check Constraints
        if check_temporal_overlap(start_time, end_time, master_schedule):
            print(f"   [X] REJECTED: {req.request_id} (Time Conflict)")
            rejected_count += 1
            continue

        # 3. Calculate Costs
        power_cost = calculate_energy_cost("IMAGING", duration)
        data_cost = calculate_data_volume(duration)
 
        # 4. Add to Schedule
        new_task = Task(
            task_id=f"TASK-{req.request_id}",
            action="IMAGING",
            start_time=start_time,
            end_time=end_time,
            power_cost_wh=power_cost, 
            data_cost_gb=data_cost   
        )
        master_schedule.append(new_task)
        print(f"   [V] SCHEDULED: {req.request_id} (Priority {req.priority})")
    print(f"[SCHEDULER] Final Plan: {len(master_schedule)} Accepted, {rejected_count} Rejected.")

    return master_schedule
 