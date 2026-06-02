"""
DISHA — Constellation propagator (NEXUS tasking layer).

3-satellite SSO constellation, analytic propagator with J2 secular
RAAN drift. Circular orbit assumed (e ≈ 0) so the closed-form geometry
is straightforward and good enough for access-window computation.

This is intentionally NOT SGP4 — the demo brief says analytic J2 only.
The point is to produce repeatable, deterministic orbits that the
scheduler can plan against without depending on TLE inputs.

State per satellite at time t:
    r_eci(t) — 3-vector position in J2000 ECI (km)
    sub-satellite lat/lon — projected to spherical Earth

Reference frames: J2000 ECI for orbit math; ECEF for ground geometry.
A simple GMST estimate handles the ECI→ECEF rotation; arcsecond-class
accuracy isn't needed for a 500 km sensor cone.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import List

import numpy as np


# ─── Constants ───────────────────────────────────────────────────────

MU_EARTH = 398_600.4418         # km^3/s^2
R_EARTH = 6378.137              # km, equatorial
J2 = 1.082_626_68e-3
EARTH_ROT_RATE = 7.292_115e-5   # rad/s


# ─── Spec ────────────────────────────────────────────────────────────

@dataclass
class SatelliteSpec:
    """One satellite in the constellation."""
    sat_id: str
    name: str
    semi_major_axis_km: float
    inclination_deg: float
    raan_deg: float
    arg_perigee_deg: float = 0.0
    true_anomaly_deg: float = 0.0
    epoch: datetime = field(
        default_factory=lambda: datetime(2026, 1, 1, tzinfo=timezone.utc)
    )
    color: str = "#5a7fa8"          # display tint (DISHA palette)

    @property
    def period_sec(self) -> float:
        return 2 * math.pi * math.sqrt(self.semi_major_axis_km ** 3 / MU_EARTH)

    @property
    def altitude_km(self) -> float:
        return self.semi_major_axis_km - R_EARTH

    @property
    def ltan_str(self) -> str:
        """
        Approximate Local Time of Ascending Node from RAAN.
        For SSO, LTAN drifts ~1 deg/day; we report the snapshot LTAN
        at the satellite's epoch — fine for demo display.
        """
        # LTAN ≈ 12 + (RAAN_sun - RAAN_sat) / 15 ; demo: just shift from noon
        ltan_hours = (12.0 + (self.raan_deg / 15.0)) % 24.0
        h = int(ltan_hours)
        m = int(round((ltan_hours - h) * 60))
        if m == 60:
            h = (h + 1) % 24
            m = 0
        return f"{h:02d}:{m:02d}"


# ─── Default constellation ───────────────────────────────────────────

def default_constellation(
    altitude_km: float = 500.0,
    inclination_deg: float = 97.4,
    raan_base_deg: float = 22.0,
) -> List[SatelliteSpec]:
    """3-sat SSO at the same altitude/inclination, RAAN spaced 120° apart."""
    a_km = R_EARTH + altitude_km
    palette = ["#5a7fa8", "#6b9c7c", "#b39148"]   # DISHA-calm
    return [
        SatelliteSpec(
            sat_id=f"NX-{i+1:02d}",
            name=f"NEXUS-{i+1:02d}",
            semi_major_axis_km=a_km,
            inclination_deg=inclination_deg,
            raan_deg=(raan_base_deg + 120.0 * i) % 360.0,
            true_anomaly_deg=120.0 * i,             # spread along orbit too
            color=palette[i],
        )
        for i in range(3)
    ]


# ─── J2 secular rates ────────────────────────────────────────────────

def j2_raan_dot(sat: SatelliteSpec) -> float:
    """RAAN drift (rad/s) under J2 secular for a circular orbit."""
    a = sat.semi_major_axis_km
    n = math.sqrt(MU_EARTH / a ** 3)               # mean motion (rad/s)
    return -1.5 * n * J2 * (R_EARTH / a) ** 2 * math.cos(math.radians(sat.inclination_deg))


# ─── Propagator ──────────────────────────────────────────────────────

def _gmst(dt: datetime) -> float:
    """Greenwich Mean Sidereal Time (rad). Cheap polynomial; adequate
    for 500 km ground-track geometry."""
    jd = (dt - datetime(2000, 1, 1, 12, tzinfo=timezone.utc)).total_seconds() / 86400.0 \
         + 2451545.0
    t = (jd - 2451545.0) / 36525.0
    gmst_sec = (
        67310.548_41
        + (876600.0 * 3600.0 + 8640184.812866) * t
        + 0.093_104 * t * t
        - 6.2e-6 * t * t * t
    )
    return (math.radians(gmst_sec * 360.0 / 86400.0)) % (2 * math.pi)


def propagate_eci(sat: SatelliteSpec, when: datetime) -> np.ndarray:
    """
    Analytic propagator: circular orbit + J2 RAAN drift.
    Returns the ECI position [x, y, z] in km at time `when`.
    """
    dt_s = (when - sat.epoch).total_seconds()
    a = sat.semi_major_axis_km
    n = math.sqrt(MU_EARTH / a ** 3)

    # Current RAAN (with J2 secular drift)
    raan = math.radians(sat.raan_deg) + j2_raan_dot(sat) * dt_s
    inc = math.radians(sat.inclination_deg)
    # Argument of latitude u = ω + ν (circular orbit), advances at mean motion
    u0 = math.radians(sat.arg_perigee_deg + sat.true_anomaly_deg)
    u = u0 + n * dt_s

    # Perifocal → ECI (rotated by RAAN about z, inc about x, u about z)
    cos_u, sin_u = math.cos(u), math.sin(u)
    cos_i, sin_i = math.cos(inc), math.sin(inc)
    cos_O, sin_O = math.cos(raan), math.sin(raan)

    x = a * (cos_O * cos_u - sin_O * sin_u * cos_i)
    y = a * (sin_O * cos_u + cos_O * sin_u * cos_i)
    z = a * (sin_u * sin_i)
    return np.array([x, y, z])


def eci_to_lla(r_eci: np.ndarray, when: datetime) -> tuple[float, float, float]:
    """ECI → sub-satellite (lat_deg, lon_deg, alt_km) on spherical Earth."""
    gmst = _gmst(when)
    cos_g, sin_g = math.cos(gmst), math.sin(gmst)
    x_e = cos_g * r_eci[0] + sin_g * r_eci[1]
    y_e = -sin_g * r_eci[0] + cos_g * r_eci[1]
    z_e = r_eci[2]
    rmag = math.sqrt(x_e * x_e + y_e * y_e + z_e * z_e)
    lat = math.degrees(math.asin(z_e / rmag))
    lon = math.degrees(math.atan2(y_e, x_e))
    return lat, lon, rmag - R_EARTH


def sample_orbit(sat: SatelliteSpec, t_start: datetime, t_stop: datetime,
                 step_sec: float = 60.0) -> List[dict]:
    """Sample one full pass-resolution orbit track for the visualization."""
    n = max(2, int((t_stop - t_start).total_seconds() / step_sec) + 1)
    points = []
    for i in range(n):
        when = t_start + timedelta(seconds=i * step_sec)
        r = propagate_eci(sat, when)
        lat, lon, alt = eci_to_lla(r, when)
        points.append({
            "t": when.isoformat(),
            "x_km": float(r[0]), "y_km": float(r[1]), "z_km": float(r[2]),
            "lat_deg": lat, "lon_deg": lon, "alt_km": alt,
        })
    return points
