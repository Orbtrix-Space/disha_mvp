import math
import numpy as np
from datetime import datetime, timezone

def get_julian_date(dt: datetime) -> float:
    """
    Calculates Julian Date (JD) using your custom formula.
    """
    # Ensure time is in UTC
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    year = dt.year
    month = dt.month
    day = dt.day
    hour = dt.hour
    min = dt.minute
    sec = dt.second + (dt.microsecond / 1e6)

    # Universal Time in hours
    UT = hour + (min / 60) + (sec / 3600)
    
    # Month adjustment
    ee = math.floor((month + 9) / 12)

    # Julian Date Calculation
    jd_val = (367 * year) \
             - math.floor((7 * (year + ee)) / 4) \
             + math.floor((275 * month) / 9) \
             + day + 1721013.5 + (UT / 24)

    return jd_val

def get_gmst(dt: datetime) -> float:
    """
    Calculates Greenwich Mean Sidereal Time (GMST) in Radians.
    Uses the detailed IAU formula provided by the System Engineer.
    """
    JD = get_julian_date(dt)

    # --- YOUR FORMULA IMPLEMENTATION ---
    JD_mid = math.floor(JD) + 0.5
    days_mid = JD - JD_mid
    UT = days_mid * 3600 * 24 # UT in seconds
    
    t = (JD - 2451545.0) / 36525.0
    t0 = (JD_mid - 2451545.0) / 36525.0

    # Calculate GMST in seconds
    GMST1 = 24110.54841 + 8640184.812866 * t0 + 1.002737909350795 * UT + 0.093104 * pow(t, 2) - 0.0000062 * pow(t, 3)

    # Normalize to the range [0, 86400)
    GMST0 = math.fmod(GMST1, 86400.0)
    if (GMST0 < 0):
        GMST0 += 86400.0 # Ensure it's positive

    # Convert seconds to degrees
    GMST_deg = GMST0 / 240.0
    
    # CRITICAL: Convert to Radians for Python Math functions
    return np.deg2rad(GMST_deg)