from datetime import datetime, timedelta
import numpy as np

# Import the Real Math modules we just built
from src.core.flight_dynamics.propagator import propagate_orbit
from src.core.flight_dynamics.transforms import eci_to_ecef
from src.core.flight_dynamics.geometry import is_visible
from src.core.flight_dynamics.time import get_gmst # Needed for timestamp updates

def check_feasibility(request, mission_state):
    """
    REAL PHYSICS VERSION.
    Propagates the orbit using J2 physics and checks for geometric visibility.
    """
    print(f"[FD] Running J2 Simulation for Request {request.request_id}...")
    
    # 1. Setup Simulation
    # We simulate from the request start time until the request end time
    sim_start_time = request.window_start
    sim_end_time = request.window_end
    duration_sec = (sim_end_time - sim_start_time).total_seconds()
    
    # Get Initial State from the MissionState object
    # We need to make sure we are starting the simulation from the RIGHT time.
    # Note: In a real system, we would propagate from "Now" to "Window Start" first.
    # For Week 2 MVP, we assume the satellite state provided is AT the window start.
    
    initial_state_dict = {
        "position": mission_state.position,
        "velocity": mission_state.velocity,
        "epoch": mission_state.current_time
    }
    
    # 2. Run the Propagator (The "Physics Engine")
    # Step size = 60 seconds (Trade-off between speed and accuracy)
    print(f"[FD] Propagating orbit for {duration_sec/3600:.1f} hours...")
    trajectory = propagate_orbit(initial_state_dict, duration_sec, step_size=60.0)
    
    # 3. Analyze Accessibility (The "Search")
    access_windows = []
    in_view = False
    current_window_start = None
    
    for step in trajectory:
        # Calculate current time for this step
        time_offset = step["time_offset"]
        current_dt = sim_start_time + timedelta(seconds=time_offset)
        
        # Get Position in ECI
        r_eci = step["eci_state"][:3]
        
        # Convert to Earth-Fixed (ECEF) so we can compare with City
        r_ecef = eci_to_ecef(r_eci, current_dt)
        
        # Check Visibility
        visible, elevation = is_visible(
            r_ecef, 
            request.target_lat, 
            request.target_lon
        )
        
        # Logic to detect Start (AOS) and End (LOS)
        if visible and not in_view:
            # We just entered the circle!
            in_view = True
            current_window_start = current_dt
            
        elif not visible and in_view:
            # We just left the circle!
            in_view = False
            # Save the window
            access_windows.append((current_window_start, current_dt))
            
    # 4. Return Results
    is_feasible = len(access_windows) > 0
    
    return {
        "is_feasible": is_feasible,
        "windows": access_windows
    }

