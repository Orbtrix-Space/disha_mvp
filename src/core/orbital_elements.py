import numpy as np
from src.utils.constants import MU_EARTH


def state_to_keplerian(position, velocity, mu=MU_EARTH):
    """
    Convert ECI state vector (position, velocity) to Keplerian orbital elements.
    Returns dict with: a, e, i, raan, omega, nu, period_min
    """
    r_vec = np.array(position, dtype=float)
    v_vec = np.array(velocity, dtype=float)

    r = np.linalg.norm(r_vec)
    v = np.linalg.norm(v_vec)

    # Specific angular momentum
    h_vec = np.cross(r_vec, v_vec)
    h = np.linalg.norm(h_vec)

    # Node vector (K x H)
    k_hat = np.array([0, 0, 1])
    n_vec = np.cross(k_hat, h_vec)
    n = np.linalg.norm(n_vec)

    # Eccentricity vector
    e_vec = (1 / mu) * (np.cross(v_vec, h_vec) - mu * r_vec / r)
    e = np.linalg.norm(e_vec)

    # Specific energy -> semi-major axis
    energy = 0.5 * v ** 2 - mu / r
    if abs(energy) < 1e-10:
        a = float('inf')
    else:
        a = -mu / (2 * energy)

    # Inclination
    i = np.degrees(np.arccos(np.clip(h_vec[2] / h, -1, 1)))

    # RAAN
    if n > 1e-10:
        raan = np.degrees(np.arccos(np.clip(n_vec[0] / n, -1, 1)))
        if n_vec[1] < 0:
            raan = 360 - raan
    else:
        raan = 0.0

    # Argument of periapsis
    if n > 1e-10 and e > 1e-10:
        omega = np.degrees(np.arccos(np.clip(np.dot(n_vec, e_vec) / (n * e), -1, 1)))
        if e_vec[2] < 0:
            omega = 360 - omega
    else:
        omega = 0.0

    # True anomaly
    if e > 1e-10:
        nu = np.degrees(np.arccos(np.clip(np.dot(e_vec, r_vec) / (e * r), -1, 1)))
        if np.dot(r_vec, v_vec) < 0:
            nu = 360 - nu
    else:
        nu = 0.0

    # Orbital period
    if a > 0:
        period_sec = 2 * np.pi * np.sqrt(a ** 3 / mu)
        period_min = period_sec / 60.0
    else:
        period_min = 0.0

    return {
        "semi_major_axis_km": round(float(a), 3),
        "eccentricity": round(float(e), 6),
        "inclination_deg": round(float(i), 4),
        "raan_deg": round(float(raan), 4),
        "arg_periapsis_deg": round(float(omega), 4),
        "true_anomaly_deg": round(float(nu), 4),
        "period_min": round(float(period_min), 2),
    }
