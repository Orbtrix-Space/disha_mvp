from src.core.state_manager import MissionState
from src.core.flight_dynamics import check_feasibility
from src.core.mission_planner import generate_mission_plan
from src.core.decision_manager import validate_plan
from src.utils.scenario import generate_scenarios

def run_disha_scheduler_demo():
    print("==========================================")
    print("      DISHA-SAT MISSION PLANNING SYSTEM   ")
    print("==========================================")

    # ---------------------------------------------------------
    # STEP 1: Generate Random Scenarios (The "Users")
    # ---------------------------------------------------------
    # Create 10 random requests to test the scheduler
    requests = generate_scenarios(n=10)
    
    # ---------------------------------------------------------
    # STEP 2: Load Satellite State
    # ---------------------------------------------------------
    satellite = MissionState()
    print(f"\n[SYSTEM] Satellite Battery: {satellite.get_state()['battery_pct']}%")

    # ---------------------------------------------------------
    # STEP 3: Pre-Check Feasibility (Physics)
    # ---------------------------------------------------------
    # We check if the satellite physically passes over these cities.
    valid_requests = []
    
    print(f"\n[PHYSICS] Checking visibility for {len(requests)} requests...")
    
    for req in requests:
        # Run J2 Propagator (Week 2 Code)
        fd_result = check_feasibility(req, satellite)
        
        if fd_result["is_feasible"]:
            # Store the windows so the Scheduler knows WHEN to schedule
            req.feasible_windows = fd_result["windows"]
            valid_requests.append(req)
        else:
            print(f"   > {req.request_id}: NOT VISIBLE (Discarded)")

    print(f"\n[PHYSICS] {len(valid_requests)} requests have valid access windows.")

    # ---------------------------------------------------------
    # STEP 4: Run the Planner (The "Brain")
    # ---------------------------------------------------------
    # This calls your new logic in mission_planner.py
    # It sorts by Priority and resolves time conflicts
    mission_plan = generate_mission_plan(valid_requests)

    # ---------------------------------------------------------
    # STEP 5: Final Safety Check (Battery)
    # ---------------------------------------------------------
    final_decision = validate_plan(mission_plan, satellite)

    print("\n==========================================")
    print("             FINAL MANIFEST               ")
    print("==========================================")
    
    if final_decision["status"] == "APPROVED":
        for task in mission_plan.schedule:
            # Format time nicely
            start_str = task.start_time.strftime('%H:%M:%S')
            print(f"[{start_str}] {task.task_id} | Cost: {task.power_cost_wh:.1f}Wh")
        print(f"\n✅ MISSION STATUS: GREEN. READY FOR UPLINK.")
    else:
        print(f"❌ MISSION ABORTED. Reason: {final_decision['reason']}")
    print("==========================================")

if __name__ == "__main__":
    run_disha_scheduler_demo()