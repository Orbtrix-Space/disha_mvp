from datetime import datetime, timedelta
from src.models.schemas import UserRequest, MissionPlan, Task
 
def create_plan(request: UserRequest, visibility_windows: list) -> MissionPlan:
    """
    WEEK 1 STUB: Generates a DUMMY plan.
    It does NOT check for conflicts. It just assumes the first window is good.
    """
    print(f"[PLANNER] Generating plan for Request ID: {request.request_id}...")
 
    # 1. Safety Check: If Flight Dynamics said "No Windows", fail immediately.
    if not visibility_windows:
        return MissionPlan(
            request_id=request.request_id,
            is_feasible=False,
            reason="No visibility windows found",
            schedule=[]
        )
 
    # 2. Logic: Just pick the FIRST window available (DUMMY LOGIC)
    # In Week 3, we will write real scheduling logic here.
    first_window_start, first_window_end = visibility_windows[0]
    # Create a Task object (using the Schema we agreed on)
    imaging_task = Task(
        task_id=f"TASK-{request.request_id}-01",
        action="IMAGING",
        start_time=first_window_start,
        end_time=first_window_end,
        power_cost_wh=5.0,  # Fake cost
        data_cost_gb=0.5    # Fake cost
    )
 
    # 3. Return the Final Plan
    return MissionPlan(
        request_id=request.request_id,
        is_feasible=True,
        reason="SUCCESS: Scheduled in first available window",
        schedule=[imaging_task]
    )