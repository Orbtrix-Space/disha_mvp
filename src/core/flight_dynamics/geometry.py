import numpy as np

from src.core.flight_dynamics.transforms import lla_to_ecef
 
def is_visible(sat_ecef: np.array, target_lat: float, target_lon: float, min_elevation_deg: float = 10.0) -> tuple:

    """

    Checks if the satellite is visible from a target on Earth.

    Returns: (bool, elevation_angle_deg)

    """

    # 1. Where is the Target in 3D Space? (Assuming 0 altitude for the city)

    target_ecef = lla_to_ecef(target_lat, target_lon, 0.0)

    # 2. Vector from Target to Satellite (The "Range Vector")

    # "Where is the sat relative to me?"

    r_vec = sat_ecef - target_ecef

    range_km = np.linalg.norm(r_vec)

    # 3. Where is "Up"? (Zenith Vector)

    # For a sphere/ellipsoid, "Up" is just the unit vector of the target position

    # (Simplified but accurate enough for LEO access checks)

    up_vec = target_ecef / np.linalg.norm(target_ecef)

    # 4. Calculate Angle

    # sin(elevation) = (Range . Up) / |Range|

    # This uses the dot product projection

    sin_el = np.dot(r_vec, up_vec) / range_km

    # Clip value to avoid domain errors in arcsin (e.g. 1.000000001)

    sin_el = np.clip(sin_el, -1.0, 1.0)

    elevation_rad = np.arcsin(sin_el)

    elevation_deg = np.degrees(elevation_rad)

    # 5. The Verdict

    is_accessible = elevation_deg >= min_elevation_deg

    return is_accessible, elevation_deg
 