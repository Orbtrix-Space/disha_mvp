import numpy as np
import erfa
from datetime import datetime, timezone

# ======================================================
# CONSTANTS (WGS84 & IAU)
# ======================================================
WGS84_A = 6378.137                  # km
WGS84_E2 = 6.69437999014e-3
OMEGA_EARTH = 7.2921151467e-5       # rad/s (IAU value)

def eci_to_ecef(r_eci, v_eci, epoch):
    # EOP for 2024-02-10
    dut1 = -0.0191244
    xp = 0.0632 * (np.pi / 648000)
    yp = 0.2851 * (np.pi / 648000)

    # 1. UTC to Julian Date
    jd_utc1, jd_utc2 = erfa.dtf2d("UTC", epoch.year, epoch.month, epoch.day, 
                                  epoch.hour, epoch.minute, 
                                  epoch.second + epoch.microsecond * 1e-6)

    # 2. Time Scale Conversions
    # UTC -> TAI -> TT
    tai1, tai2 = erfa.utctai(jd_utc1, jd_utc2)
    jd_tt1, jd_tt2 = erfa.taitt(tai1, tai2)
    
    # UTC -> UT1
    jd_ut11, jd_ut12 = erfa.utcut1(jd_utc1, jd_utc2, dut1)

    # 3. Rotation Matrices (IAU 2006/2000A)
    c_mat = erfa.c2i06a(jd_tt1, jd_tt2)
    
    # Earth Rotation Angle
    era = erfa.era00(jd_ut11, jd_ut12)
    
    # Polar Motion
    sp = erfa.sp00(jd_tt1, jd_tt2)
    w_mat = erfa.pom00(xp, yp, sp)
    
    # 4. Combine Matrices: ECI to ECEF (ITRF)
    # Matrix order: [Polar Motion] * [Rotation Z(era)] * [Precession/Nutation]
    r_total = w_mat @ erfa.rz(era, c_mat)

    # 5. Transform Position
    r_ecef = r_total @ r_eci

    # 6. Transform Velocity
    # v_fixed = R * v_inertial - (omega x r_fixed)
    omega_vec = np.array([0.0, 0.0, OMEGA_EARTH])
    v_ecef = r_total @ v_eci - np.cross(omega_vec, r_ecef)

    return r_ecef, v_ecef

def ecef_to_lla(r_ecef):
    """Iterative geodetic conversion (Bowring's or standard iteration)"""
    x, y, z = r_ecef
    lon = np.arctan2(y, x)
    r_xy = np.sqrt(x**2 + y**2)
    lat = np.arctan2(z, r_xy * (1 - WGS84_E2))

    for _ in range(10): 
        sin_lat = np.sin(lat)
        N = WGS84_A / np.sqrt(1 - WGS84_E2 * sin_lat**2)
        alt = r_xy / np.cos(lat) - N
        lat = np.arctan2(z, r_xy * (1 - WGS84_E2 * N / (N + alt)))

    return np.degrees(lat), np.degrees(lon), alt

