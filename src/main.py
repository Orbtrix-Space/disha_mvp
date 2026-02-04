from datetime import datetime, timedelta
from src.models.schemas import UserRequest
from src.core.state_manager import MissionState
from src.core.flight_dynamics import check_feasibility
from src.core.mission_planner import create_plan
from src.core.decision_manager import validate_plan

def run_disha_mission():
    print("==========================================")
    print("      DISHA-SAT-01 MISSION CONTROL        ")
    print("==========================================")

    # ---------------------------------------------------------
    # STEP 1: Receive User Request
    # ---------------------------------------------------------
    request = UserRequest(
        request_id="REQ-BLR-001",
        target_lat=12.9716,
        target_lon=77.5946,  # Bangalore
        priority=5,
        window_start=datetime.now(),
        window_end=datetime.now() + timedelta(hours=24),
        min_duration_sec=60
    )
    print(f"\n[STEP 1] Received Request: {request.request_id} for Target ({request.target_lat}, {request.target_lon})")

    # ---------------------------------------------------------
    # STEP 2: Load Satellite State
    # ---------------------------------------------------------
    # The Systems Engineer's code wakes up here
    satellite = MissionState()
    current_health = satellite.get_state()
    print(f"[STEP 2] Satellite Status: Battery={current_health['battery_pct']}% | Storage Used={current_health['storage_gb']}GB")

    # ---------------------------------------------------------
    # STEP 3: Check Feasibility (Flight Dynamics)
    # ---------------------------------------------------------
    # Your dummy FD code runs here
    fd_result = check_feasibility(request, satellite)
    
    if not fd_result["is_feasible"]:
        print("[STEP 3] FAILED: Target not visible.")
        return

    print(f"[STEP 3] SUCCESS: Found {len(fd_result['windows'])} pass(es).")

    # ---------------------------------------------------------
    # STEP 4: Generate Mission Plan (Planner)
    # ---------------------------------------------------------
    # The Junior's code runs here
    plan = create_plan(request, fd_result["windows"])
    
    if not plan.is_feasible:
        print(f"[STEP 4] FAILED: Planner could not schedule. Reason: {plan.reason}")
        return

    print(f"[STEP 4] SUCCESS: Generated Plan with {len(plan.schedule)} task(s).")
    print(f"         > Action: {plan.schedule[0].action}")
    print(f"         > Start : {plan.schedule[0].start_time}")

    # ---------------------------------------------------------
    # STEP 5: Final Safety Check (Decision Manager)
    # ---------------------------------------------------------
    # The Safety Logic runs here
    final_decision = validate_plan(plan, satellite)

    print("\n------------------------------------------")
    if final_decision["status"] == "APPROVED":
        print(f"✅ MISSION STATUS: GREEN. EXECUTION AUTHORIZED.")
    else:
        print(f"❌ MISSION STATUS: RED. ABORTED. Reason: {final_decision['reason']}")
    print("------------------------------------------")

if __name__ == "__main__":
    run_disha_mission()