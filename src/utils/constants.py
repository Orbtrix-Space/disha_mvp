import numpy as np

# ====================================================
# WGS84 EARTH CONSTANTS (The "Standard" Earth Model)
# ====================================================

# Earth's Gravitational Parameter (mu = GM)
# Units: km^3 / s^2
# This defines how hard Earth pulls on the satellite.
MU_EARTH = 398600.4418

# Earth's Equatorial Radius
# Units: km
# This is the "Size" of Earth. Used to check altitude.
EARTH_RADIUS_KM = 6378.137

# Earth's Rotation Rate (Omega)
# Units: radians / second
# How fast Earth spins. Critical for calculating Longitude.
EARTH_ROTATION_RATE = 7.292115e-5

# J2 Perturbation Coefficient
# Dimensionless
# This number represents the "Bulge" at the equator.
# It causes the orbit to drift (Precession), which is what we need to calculate.
J2_COEFF = 1.08262668e-3

# ====================================================
# CONVERSION HELPERS
# ====================================================
deg2rad = np.pi / 180.0
rad2deg = 180.0 / np.pi