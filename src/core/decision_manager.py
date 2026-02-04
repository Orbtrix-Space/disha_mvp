from src.models.schemas import MissionPlan
from src.core.state_manager import MissionState
 
def validate_plan(plan: MissionPlan, state: MissionState) -> dict:
    """
    WEEK 1 STUB: Final Safety Check.
    Ensures the satellite has enough power to execute the plan.
    """
    print(f"[DECISION] Validating Plan ID: {plan.request_id}...")
 
    # 1. If the plan is already failed (by Flight Dynamics), just pass it through.
    if not plan.is_feasible:
        return {"status": "REJECTED", "reason": plan.reason}
 
    # 2. Calculate Total Power Cost of the Plan
    total_power_needed = sum(task.power_cost_wh for task in plan.schedule)
    # 3. Get Current Battery Level
    current_battery = state.get_state()["battery_wh"]
    # 4. The Decision Logic (Can we afford this?)
    if total_power_needed > current_battery:
        print(f"[DECISION] CRITICAL: Not enough power! Need {total_power_needed}Wh, Have {current_battery}Wh.")
        return {"status": "REJECTED", "reason": "INSUFFICIENT_POWER"}
 
    # 5. Success
    print(f"[DECISION] Plan APPROVED. Power Margin: {current_battery - total_power_needed} Wh.")
    return {"status": "APPROVED", "plan": plan}