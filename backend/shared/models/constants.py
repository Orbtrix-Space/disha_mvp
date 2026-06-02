"""
DISHA Beta — Constants Module
WGS84 constants, physical constants, default configurations.
"""

import numpy as np

# ====================================================
# WGS84 EARTH CONSTANTS
# ====================================================

# Earth's Gravitational Parameter (GM)  [km^3/s^2]
MU_EARTH = 3.986004418e5  # 3.986004418 × 10^14 m³/s² = 398600.4418 km³/s²

# Earth's Equatorial Radius  [km]
EARTH_RADIUS_KM = 6378.137

# Earth's Equatorial Radius  [m]
EARTH_RADIUS_M = 6378137.0

# Earth's Rotation Rate  [rad/s]
EARTH_ROTATION_RATE = 7.292115e-5

# J2 Perturbation Coefficient (oblateness)
J2_COEFF = 1.08262668e-3

# WGS84 Flattening
WGS84_FLATTENING = 1.0 / 298.257223563

# WGS84 Eccentricity Squared
WGS84_E_SQ = 2 * WGS84_FLATTENING - WGS84_FLATTENING ** 2

# ====================================================
# PHYSICAL CONSTANTS
# ====================================================

# Speed of Light  [m/s]
SPEED_OF_LIGHT = 299792458.0

# Solar constant at 1 AU  [W/m^2]
SOLAR_CONSTANT = 1361.0

# ====================================================
# DEFAULT SATELLITE CONFIGURATION
# ====================================================

DEFAULT_ORBIT = {
    "position_eci_km": [7000.0, 0.0, 0.0],
    "velocity_eci_km_s": [0.0, 7.5, 0.0],
}

DEFAULT_POWER = {
    "battery_capacity_wh": 500.0,
    "solar_array_output_w": 18.0,
    "base_load_w": 3.0,
    "bus_voltage_nominal": 12.0,
    "solar_panel_current_nominal": 1.5,
}

DEFAULT_THERMAL = {
    "panel_temp_warning_high": 85.0,
    "panel_temp_warning_low": -40.0,
    "panel_temp_critical_high": 100.0,
    "panel_temp_critical_low": -50.0,
    "battery_temp_warning_high": 45.0,
    "battery_temp_warning_low": 0.0,
    "battery_temp_critical_high": 55.0,
    "battery_temp_critical_low": -10.0,
}

DEFAULT_STORAGE = {
    "capacity_mb": 1048576.0,  # 1024 GB in MB
}

DEFAULT_COMMS = {
    "snr_nominal_db": 15.0,
    "snr_warning_db": 8.0,
    "snr_critical_db": 5.0,
}

# ====================================================
# CONVERSION HELPERS
# ====================================================
deg2rad = np.pi / 180.0
rad2deg = 180.0 / np.pi
