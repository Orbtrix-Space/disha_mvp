from src.models.schemas import MissionPlan, Task
from src.models.resources import calculate_energy_cost, calculate_data_volume
# We import the rules from the file you just made
from src.core.scheduler.constraints import check_temporal_overlap

def generate_mission_plan(requests) -> MissionPlan:
    """
    The 'Greedy' Scheduler Algorithm.
    Task: Update src/core/mission_planner.py (Week 3 Task 4)
    Logic: Sort by Priority -> Find First Gap -> Schedule
    """
    print(f"[PLANNER] Processing {len(requests)} requests...")
    
    # 1. Sort Requests (Highest Priority First)
    # Critical tasks (10) get first dibs on the timeline.
    sorted_requests = sorted(requests, key=lambda x: x.priority, reverse=True)
    
    scheduled_tasks = []
    rejected_count = 0
    
    for req in sorted_requests:
        # Check if Physics found a valid window
        if not hasattr(req, 'feasible_windows') or not req.feasible_windows:
            print(f"   [X] REJECTED: {req.request_id} (No Access Window)")
            rejected_count += 1
            continue

        # STRATEGY: Find First Gap (Greedy)
        # We look at all valid windows and pick the first one that doesn't conflict.
        selected_window = None
        
        for window in req.feasible_windows:
            start_t, end_t = window
            
            # Check Rule: Does this specific window overlap with existing plan?
            if not check_temporal_overlap(start_t, end_t, scheduled_tasks):
                selected_window = window
                break # Found a gap! Stop looking.
        
        # If no gap was found after checking all windows
        if selected_window is None:
            print(f"   [X] REJECTED: {req.request_id} (Conflict - No gap found)")
            rejected_count += 1
            continue

        # 2. Calculate Costs
        start_time, end_time = selected_window
        duration = (end_time - start_time).total_seconds()
        
        power_cost = calculate_energy_cost("IMAGING", duration)
        data_cost = calculate_data_volume(duration)

        # 3. Create Task & Add to Schedule
        new_task = Task(
            task_id=f"TASK-{req.request_id}",
            action="IMAGING",
            start_time=start_time,
            end_time=end_time,
            power_cost_wh=power_cost, 
            data_cost_gb=data_cost   
        )
        scheduled_tasks.append(new_task)
        print(f"   [V] SCHEDULED: {req.request_id} (Priority {req.priority})")

    # 4. Wrap it in a MissionPlan object
    plan = MissionPlan(
        request_id="MASTER-PLAN-001",
        is_feasible=True,
        reason=f"Scheduled {len(scheduled_tasks)}/{len(requests)} requests",
        schedule=scheduled_tasks
    )
        
    print(f"[PLANNER] Final Plan: {len(scheduled_tasks)} Accepted, {rejected_count} Rejected.")
    return plan