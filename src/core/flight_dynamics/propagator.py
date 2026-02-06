import numpy as np
from src.utils.constants import MU_EARTH, EARTH_RADIUS_KM, J2_COEFF

def get_j2_acceleration(position: np.array) -> np.array:
    """
    Calculates the acceleration vector (ax, ay, az) acting on the satellite.
    Includes:
      1. Point Mass Gravity (Newtons Law)
      2. J2 Perturbation (The Equatorial Bulge)
    """
    x, y, z = position
    r = np.linalg.norm(position)
    
    # Pre-compute common terms to save CPU cycles
    r_sq = r**2
    r_cb = r**3
    z_sq = z**2
    
    # The J2 Scaling Factor
    # Factor = 1.5 * J2 * (R_earth / r)^2
    factor = 1.5 * J2_COEFF * (EARTH_RADIUS_KM / r)**2
    
    # Term common to X and Y
    # (1 - 5 * (z/r)^2)
    tx_ty = (1.0 - 5.0 * (z_sq / r_sq))
    
    # Term specific to Z
    # (3 - 5 * (z/r)^2)
    tz = (3.0 - 5.0 * (z_sq / r_sq))
    
    # Calculate Accelerations
    # a = -(mu/r^3) * position * [J2 correction]
    mu_r3 = MU_EARTH / r_cb
    
    ax = -mu_r3 * x * (1.0 + factor * tx_ty)
    ay = -mu_r3 * y * (1.0 + factor * tx_ty)
    az = -mu_r3 * z * (1.0 + factor * tz)
    
    return np.array([ax, ay, az])

def rk4_step(state: np.array, dt: float) -> np.array:
    """
    Moves the satellite forward by 'dt' seconds using Runge-Kutta 4 Integration.
    State vector = [x, y, z, vx, vy, vz]
    """
    position = state[:3]
    velocity = state[3:]
    
    # --- K1 ---
    k1_v = get_j2_acceleration(position)
    k1_r = velocity
    
    # --- K2 ---
    # Estimate state at half-step using K1 slopes
    r2 = position + k1_r * (dt / 2.0)
    v2 = velocity + k1_v * (dt / 2.0)
    
    k2_v = get_j2_acceleration(r2)
    k2_r = v2
    
    # --- K3 ---
    # Estimate state at half-step using K2 slopes
    r3 = position + k2_r * (dt / 2.0)
    v3 = velocity + k2_v * (dt / 2.0)
    
    k3_v = get_j2_acceleration(r3)
    k3_r = v3
    
    # --- K4 ---
    # Estimate state at full-step using K3 slopes
    r4 = position + k3_r * dt
    v4 = velocity + k3_v * dt
    
    k4_v = get_j2_acceleration(r4)
    k4_r = v4
    
    # --- COMBINE (Weighted Average) ---
    # New Pos = Old Pos + (dt/6) * (k1 + 2k2 + 2k3 + k4)
    new_position = position + (dt / 6.0) * (k1_r + 2*k2_r + 2*k3_r + k4_r)
    new_velocity = velocity + (dt / 6.0) * (k1_v + 2*k2_v + 2*k3_v + k4_v)
    
    return np.concatenate((new_position, new_velocity))

def propagate_orbit(initial_state: dict, duration_seconds: float, step_size: float = 60.0):
    """
    Generates a list of states over a duration.
    Input:
       initial_state: {'position': [x,y,z], 'velocity': [vx,vy,vz], 'epoch': datetime}
       duration_seconds: How long to fly (e.g., 86400 for 1 day)
    """
    # Unpack initial state
    r = np.array(initial_state['position'])
    v = np.array(initial_state['velocity'])
    current_state_vec = np.concatenate((r, v))
    
    times = np.arange(0, duration_seconds, step_size)
    results = []
    
    for t in times:
        # Save current state
        results.append({
            "time_offset": t,
            "eci_state": current_state_vec
        })
        
        # Move forward one step
        current_state_vec = rk4_step(current_state_vec, step_size)
        
    return results