import numpy as np
from datetime import datetime
from src.core.flight_dynamics.time import get_gmst
 
def eci_to_ecef(r_eci: list, dt: datetime) -> np.array:
    """
    Rotates the ECI (Inertial) vector into the ECEF (Earth-Fixed) frame.
    """
    # 1. Get the rotation angle of the Earth (GMST)
    theta = get_gmst(dt)

    # 2. Define the Rotation Matrix (Z-axis rotation)
    c, s = np.cos(theta), np.sin(theta)
    R_z = np.array([
        [ c, s, 0],
        [-s, c, 0],
        [ 0, 0, 1]
    ])
    # 3. Apply rotation
    r_eci_vec = np.array(r_eci)

    return np.dot(R_z, r_eci_vec)
 
def ecef_to_lla(r_ecef: np.array) -> dict:
    """
    Converts ECEF (X, Y, Z) to LLA using the System Engineer's Iterative Method.
    Input: r_ecef [x, y, z] in km
    Output: Dictionary with lat (deg), lon (deg), alt_km
    """
    # Unpack the vector into scalars for your formula
    ecefX, ecefY, ecefZ = r_ecef
 
    # WGS-84 parameters
    a = 6378.138  # Semi-major axis (km)
    f = 1 / 298.257223563  # Flattening
    e_sq = 2 * f - f ** 2  # Eccentricity squared
    tol = 1e-06
    r_delta_sat = np.sqrt(ecefX ** 2 + ecefY ** 2)
 
    # Longitude calculation
    long_gd = np.arctan2(ecefY, ecefX)
 
    # Initial guess for latitude
    lat_gd = np.arctan2(ecefZ, r_delta_sat)
 
    # Iteratively compute geodetic latitude
    while True:
        N = a / np.sqrt(1 - e_sq * (np.sin(lat_gd) ** 2))
        lat_gd_new = np.arctan2(ecefZ + e_sq * N * np.sin(lat_gd), r_delta_sat)
 
        if np.abs(lat_gd_new - lat_gd) < tol:
            lat_gd = lat_gd_new
            break
        lat_gd = lat_gd_new
 
    # Compute ellipsoidal height
    N = a / np.sqrt(1 - e_sq * (np.sin(lat_gd) ** 2))
    ellipsoidal_height = (r_delta_sat / np.cos(lat_gd)) - N

    # Return in the standard dictionary format the rest of the app expects
    return {
        "lat": np.degrees(lat_gd),
        "lon": np.degrees(long_gd),
        "alt_km": ellipsoidal_height
    }

def lla_to_ecef(lat_deg: float, lon_deg: float, alt_km: float) -> np.array:
    """
    Converts Latitude, Longitude, Altitude to Earth-Fixed X, Y, Z.
    Used to find where the Ground Station is in 3D space.
    """
    lat_rad = np.radians(lat_deg)
    lon_rad = np.radians(lon_deg)
    a = 6378.137  # Earth Radius
    f = 1.0 / 298.257223563
    e2 = f * (2.0 - f)

    # Radius of curvature in the prime vertical
    N = a / np.sqrt(1.0 - e2 * np.sin(lat_rad)**2)
    x = (N + alt_km) * np.cos(lat_rad) * np.cos(lon_rad)
    y = (N + alt_km) * np.cos(lat_rad) * np.sin(lon_rad)
    z = (N * (1.0 - e2) + alt_km) * np.sin(lat_rad)

    return np.array([x, y, z])