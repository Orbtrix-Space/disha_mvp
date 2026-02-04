from datetime import datetime, timedelta
 
def check_feasibility(request, mission_state):

    """

    WEEK 1 STUB: Dummy Flight Dynamics Check.

    It does NOT run J2 Propagator yet.

    It returns a fake window starting 10 minutes after the request start.

    """

    print(f"[FD] Calculating J2 Orbit for Target ({request.target_lat}, {request.target_lon})...")

    print(f"[FD] Satellite Battery at {mission_state.get_state()['battery_pct']}% - Power OK.")

    # DUMMY LOGIC:

    # Create a fake "Pass" that starts 10 minutes after the requested window starts

    # and lasts for 5 minutes.

    fake_start = request.window_start + timedelta(minutes=10)

    fake_end = fake_start + timedelta(minutes=5)

    # Return the format the Planner expects

    return {

        "is_feasible": True,

        "windows": [(fake_start, fake_end)]

    }
 