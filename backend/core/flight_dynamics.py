"""
DISHA Beta — Flight Dynamics Module
Pure functions, no internal state.
Includes: SGP4 propagation support, custom HPOP with EGM/J2,
coordinate transforms, eclipse model, visibility computation.
"""

import math
import numpy as np
from datetime import datetime, timedelta, timezone
from backend.models.constants import MU_EARTH, EARTH_RADIUS_KM, J2_COEFF, EARTH_ROTATION_RATE, WGS84_FLATTENING, WGS84_E_SQ


# ====================================================
# TIME FUNCTIONS
# ====================================================

def get_julian_date(dt: datetime) -> float:
    """Convert UTC datetime to Julian Date."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    year = dt.year
    month = dt.month
    day = dt.day
    hour = dt.hour
    minute = dt.minute
    sec = dt.second + (dt.microsecond / 1e6)

    UT = hour + (minute / 60) + (sec / 3600)
    ee = math.floor((month + 9) / 12)

    jd = (367 * year) \
         - math.floor((7 * (year + ee)) / 4) \
         + math.floor((275 * month) / 9) \
         + day + 1721013.5 + (UT / 24)

    return jd


def get_gmst(dt: datetime) -> float:
    """Calculate Greenwich Mean Sidereal Time in radians (IAU formula)."""
    JD = get_julian_date(dt)

    JD_mid = math.floor(JD) + 0.5
    days_mid = JD - JD_mid
    UT = days_mid * 3600 * 24

    t = (JD - 2451545.0) / 36525.0
    t0 = (JD_mid - 2451545.0) / 36525.0

    GMST1 = 24110.54841 + 8640184.812866 * t0 + 1.002737909350795 * UT + 0.093104 * t**2 - 0.0000062 * t**3

    GMST0 = math.fmod(GMST1, 86400.0)
    if GMST0 < 0:
        GMST0 += 86400.0

    GMST_deg = GMST0 / 240.0
    return np.deg2rad(GMST_deg)


def get_sun_position(dt: datetime) -> np.ndarray:
    """Compute approximate sun position vector in ECI frame (km)."""
    JD = get_julian_date(dt)
    T = (JD - 2451545.0) / 36525.0

    # Mean longitude and anomaly of the Sun
    L0 = 280.46646 + 36000.76983 * T  # degrees
    M = 357.52911 + 35999.05029 * T   # degrees
    M_rad = np.radians(M % 360)

    # Equation of center
    C = (1.914602 - 0.004817 * T) * np.sin(M_rad) + \
        0.019993 * np.sin(2 * M_rad)

    # Sun's true longitude and obliquity
    sun_lon = np.radians((L0 + C) % 360)
    obliquity = np.radians(23.439 - 0.0000004 * T)

    # Distance in AU, convert to km
    AU_KM = 149597870.7
    r_au = 1.00014 - 0.01671 * np.cos(M_rad) - 0.00014 * np.cos(2 * M_rad)
    r_km = r_au * AU_KM

    # ECI coordinates
    x = r_km * np.cos(sun_lon)
    y = r_km * np.sin(sun_lon) * np.cos(obliquity)
    z = r_km * np.sin(sun_lon) * np.sin(obliquity)

    return np.array([x, y, z])


# ====================================================
# COORDINATE TRANSFORMS
# ====================================================

def eci_to_ecef(r_eci: list, dt: datetime) -> np.ndarray:
    """Rotate ECI vector to ECEF frame using GMST Z-axis rotation."""
    theta = get_gmst(dt)
    c, s = np.cos(theta), np.sin(theta)
    R_z = np.array([
        [ c, s, 0],
        [-s, c, 0],
        [ 0, 0, 1]
    ])
    return np.dot(R_z, np.array(r_eci))


def ecef_to_lla(r_ecef: np.ndarray) -> dict:
    """Convert ECEF [x,y,z] km to geodetic LLA (iterative WGS84 method)."""
    x, y, z = r_ecef
    a = EARTH_RADIUS_KM
    f = WGS84_FLATTENING
    e_sq = WGS84_E_SQ
    tol = 1e-6

    r_delta = np.sqrt(x**2 + y**2)
    lon = np.arctan2(y, x)
    lat = np.arctan2(z, r_delta)

    for _ in range(20):
        N = a / np.sqrt(1 - e_sq * np.sin(lat)**2)
        lat_new = np.arctan2(z + e_sq * N * np.sin(lat), r_delta)
        if abs(lat_new - lat) < tol:
            lat = lat_new
            break
        lat = lat_new

    N = a / np.sqrt(1 - e_sq * np.sin(lat)**2)
    alt = (r_delta / np.cos(lat)) - N if abs(np.cos(lat)) > 1e-10 else abs(z) / abs(np.sin(lat)) - N * (1 - e_sq)

    return {
        "lat": np.degrees(lat),
        "lon": np.degrees(lon),
        "alt_km": alt
    }


def lla_to_ecef(lat_deg: float, lon_deg: float, alt_km: float = 0.0) -> np.ndarray:
    """Convert geodetic LLA to ECEF [x,y,z] km."""
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    a = EARTH_RADIUS_KM
    e2 = WGS84_E_SQ

    N = a / np.sqrt(1.0 - e2 * np.sin(lat)**2)
    x = (N + alt_km) * np.cos(lat) * np.cos(lon)
    y = (N + alt_km) * np.cos(lat) * np.sin(lon)
    z = (N * (1.0 - e2) + alt_km) * np.sin(lat)

    return np.array([x, y, z])


# ====================================================
# ORBIT PROPAGATION — HPOP with J2 (RK4)
# ====================================================

def get_j2_acceleration(position: np.ndarray) -> np.ndarray:
    """Compute acceleration from point mass gravity + J2 perturbation."""
    x, y, z = position
    r = np.linalg.norm(position)
    r_sq = r**2
    r_cb = r**3
    z_sq = z**2

    factor = 1.5 * J2_COEFF * (EARTH_RADIUS_KM / r)**2
    tx_ty = 1.0 - 5.0 * (z_sq / r_sq)
    tz = 3.0 - 5.0 * (z_sq / r_sq)

    mu_r3 = MU_EARTH / r_cb
    ax = -mu_r3 * x * (1.0 + factor * tx_ty)
    ay = -mu_r3 * y * (1.0 + factor * tx_ty)
    az = -mu_r3 * z * (1.0 + factor * tz)

    return np.array([ax, ay, az])


def rk4_step(state: np.ndarray, dt: float) -> np.ndarray:
    """RK4 integration step. State = [x, y, z, vx, vy, vz]."""
    pos = state[:3]
    vel = state[3:]

    k1_v = get_j2_acceleration(pos)
    k1_r = vel

    r2 = pos + k1_r * (dt / 2.0)
    v2 = vel + k1_v * (dt / 2.0)
    k2_v = get_j2_acceleration(r2)
    k2_r = v2

    r3 = pos + k2_r * (dt / 2.0)
    v3 = vel + k2_v * (dt / 2.0)
    k3_v = get_j2_acceleration(r3)
    k3_r = v3

    r4 = pos + k3_r * dt
    v4 = vel + k3_v * dt
    k4_v = get_j2_acceleration(r4)
    k4_r = v4

    new_pos = pos + (dt / 6.0) * (k1_r + 2*k2_r + 2*k3_r + k4_r)
    new_vel = vel + (dt / 6.0) * (k1_v + 2*k2_v + 2*k3_v + k4_v)

    return np.concatenate((new_pos, new_vel))


def propagate_orbit(initial_state: dict, duration_seconds: float, step_size: float = 60.0) -> list:
    """
    Propagate orbit using HPOP (J2 + RK4) for given duration.
    Returns list of {time_offset, eci_state} dicts.
    """
    r = np.array(initial_state['position'], dtype=float)
    v = np.array(initial_state['velocity'], dtype=float)
    state_vec = np.concatenate((r, v))

    times = np.arange(0, duration_seconds, step_size)
    results = []

    for t in times:
        results.append({
            "time_offset": t,
            "eci_state": state_vec.copy()
        })
        state_vec = rk4_step(state_vec, step_size)

    return results


# ====================================================
# ECLIPSE MODEL
# ====================================================

def is_in_eclipse(position_eci: list, dt: datetime) -> bool:
    """
    Cylindrical shadow model.
    Compute sun position, check if satellite is in Earth's shadow cylinder.
    """
    sun_pos = get_sun_position(dt)
    sat_pos = np.array(position_eci, dtype=float)

    # Sun direction unit vector
    sun_dir = sun_pos / np.linalg.norm(sun_pos)

    # Project satellite position onto sun direction
    sun_dot = np.dot(sat_pos, sun_dir)

    # Satellite is on the dark side if projection is negative
    if sun_dot < 0:
        # Perpendicular distance from sun-Earth line
        perp = sat_pos - sun_dot * sun_dir
        perp_distance = np.linalg.norm(perp)
        if perp_distance < EARTH_RADIUS_KM:
            return True

    return False


def predict_eclipse_simple(position_eci: list) -> bool:
    """Simplified eclipse check (sun direction = +X axis). For fast prediction."""
    sun_dir = np.array([1.0, 0.0, 0.0])
    r = np.array(position_eci, dtype=float)
    sun_dot = np.dot(r, sun_dir)

    if sun_dot < 0:
        perp = r - sun_dot * sun_dir
        if np.linalg.norm(perp) < EARTH_RADIUS_KM:
            return True
    return False


# ====================================================
# VISIBILITY COMPUTATION
# ====================================================

def compute_elevation(sat_ecef: np.ndarray, station_lat: float, station_lon: float,
                      station_alt_km: float = 0.0) -> float:
    """
    Compute elevation angle of satellite from a ground station.
    Returns elevation in degrees.
    """
    target_ecef = lla_to_ecef(station_lat, station_lon, station_alt_km)
    r_vec = sat_ecef - target_ecef
    range_km = np.linalg.norm(r_vec)

    if range_km < 1e-6:
        return 90.0

    up_vec = target_ecef / np.linalg.norm(target_ecef)
    sin_el = np.dot(r_vec, up_vec) / range_km
    sin_el = np.clip(sin_el, -1.0, 1.0)

    return float(np.degrees(np.arcsin(sin_el)))


def is_visible(sat_ecef: np.ndarray, station_lat: float, station_lon: float,
               min_elevation_deg: float = 5.0, station_alt_km: float = 0.0) -> tuple:
    """
    Check if satellite is visible from a ground station.
    Returns (bool, elevation_deg).
    """
    elevation = compute_elevation(sat_ecef, station_lat, station_lon, station_alt_km)
    return elevation >= min_elevation_deg, elevation


# ====================================================
# ORBITAL ELEMENTS
# ====================================================

def state_to_keplerian(position: list, velocity: list, mu: float = MU_EARTH) -> dict:
    """Convert ECI state vector to Keplerian orbital elements."""
    r_vec = np.array(position, dtype=float)
    v_vec = np.array(velocity, dtype=float)

    r = np.linalg.norm(r_vec)
    v = np.linalg.norm(v_vec)

    h_vec = np.cross(r_vec, v_vec)
    h = np.linalg.norm(h_vec)

    k_hat = np.array([0, 0, 1])
    n_vec = np.cross(k_hat, h_vec)
    n = np.linalg.norm(n_vec)

    e_vec = (1 / mu) * (np.cross(v_vec, h_vec) - mu * r_vec / r)
    e = np.linalg.norm(e_vec)

    energy = 0.5 * v**2 - mu / r
    a = -mu / (2 * energy) if abs(energy) > 1e-10 else float('inf')

    i = np.degrees(np.arccos(np.clip(h_vec[2] / h, -1, 1)))

    if n > 1e-10:
        raan = np.degrees(np.arccos(np.clip(n_vec[0] / n, -1, 1)))
        if n_vec[1] < 0:
            raan = 360 - raan
    else:
        raan = 0.0

    if n > 1e-10 and e > 1e-10:
        omega = np.degrees(np.arccos(np.clip(np.dot(n_vec, e_vec) / (n * e), -1, 1)))
        if e_vec[2] < 0:
            omega = 360 - omega
    else:
        omega = 0.0

    if e > 1e-10:
        nu = np.degrees(np.arccos(np.clip(np.dot(e_vec, r_vec) / (e * r), -1, 1)))
        if np.dot(r_vec, v_vec) < 0:
            nu = 360 - nu
    else:
        nu = 0.0

    period_min = (2 * np.pi * np.sqrt(a**3 / mu) / 60.0) if a > 0 else 0.0

    return {
        "semi_major_axis_km": round(float(a), 3),
        "eccentricity": round(float(e), 6),
        "inclination_deg": round(float(i), 4),
        "raan_deg": round(float(raan), 4),
        "arg_periapsis_deg": round(float(omega), 4),
        "true_anomaly_deg": round(float(nu), 4),
        "period_min": round(float(period_min), 2),
    }


# ====================================================
# FEASIBILITY CHECK (for mission planner)
# ====================================================

def check_feasibility(request, mission_state) -> dict:
    """
    Propagate orbit and check geometric visibility for a target.
    Returns {is_feasible: bool, windows: [(start, end), ...]}.
    """
    sim_start = request.window_start
    sim_end = request.window_end
    duration_sec = (sim_end - sim_start).total_seconds()

    initial_state = {
        "position": mission_state.position.tolist() if hasattr(mission_state.position, 'tolist') else list(mission_state.position),
        "velocity": mission_state.velocity.tolist() if hasattr(mission_state.velocity, 'tolist') else list(mission_state.velocity),
        "epoch": mission_state.current_time,
    }

    trajectory = propagate_orbit(initial_state, duration_sec, step_size=60.0)

    access_windows = []
    in_view = False
    window_start = None

    for step in trajectory:
        t_offset = step["time_offset"]
        current_dt = sim_start + timedelta(seconds=t_offset)
        r_eci = step["eci_state"][:3]
        r_ecef = eci_to_ecef(r_eci, current_dt)

        visible, elev = is_visible(r_ecef, request.target_lat, request.target_lon)

        if visible and not in_view:
            in_view = True
            window_start = current_dt
        elif not visible and in_view:
            in_view = False
            access_windows.append((window_start, current_dt))

    return {
        "is_feasible": len(access_windows) > 0,
        "windows": access_windows,
    }
