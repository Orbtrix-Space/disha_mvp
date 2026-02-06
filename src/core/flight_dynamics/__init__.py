from datetime import datetime, timedelta
import numpy as np

# Import the Real Math modules
from src.core.flight_dynamics.propagator import propagate_orbit
from src.core.flight_dynamics.transforms import eci_to_ecef
from src.core.flight_dynamics.geometry import is_visible
from src.core.flight_dynamics.time import get_gmst 

def check_feasibility(request, mission_state):
    """
    REAL PHYSICS VERSION.
    Propagates the orbit using J2 physics and checks for geometric visibility.
    """
    print(f"[FD] Running J2 Simulation for Request {request.request_id}...")
    
    # 1. Setup Simulation
    sim_start_time = request.window_start
    sim_end_time = request.window_end
    duration_sec = (sim_end_time - sim_start_time).total_seconds()
    
    # Get Initial State from the MissionState object
    initial_state_dict = {
        "position": mission_state.position,
        "velocity": mission_state.velocity,
        "epoch": mission_state.current_time
    }
    
    # 2. Run the Propagator (The "Physics Engine")
    print(f"[FD] Propagating orbit for {duration_sec/3600:.1f} hours...")
    trajectory = propagate_orbit(initial_state_dict, duration_sec, step_size=60.0)
    
    # 3. Analyze Accessibility (The "Search")
    access_windows = []
    in_view = False
    current_window_start = None
    
    for step in trajectory:
        time_offset = step["time_offset"]
        current_dt = sim_start_time + timedelta(seconds=time_offset)
        
        # Get Position in ECI & Convert to ECEF
        r_eci = step["eci_state"][:3]
        r_ecef = eci_to_ecef(r_eci, current_dt)
        
        # Check Visibility
        visible, elevation = is_visible(
            r_ecef, 
            request.target_lat, 
            request.target_lon
        )
        
        # Logic to detect Start (AOS) and End (LOS)
        if visible and not in_view:
            in_view = True
            current_window_start = current_dt   
        elif not visible and in_view:
            in_view = False
            access_windows.append((current_window_start, current_dt))
            
    # 4. Return Results
    is_feasible = len(access_windows) > 0
    
    return {
        "is_feasible": is_feasible,
        "windows": access_windows
    }