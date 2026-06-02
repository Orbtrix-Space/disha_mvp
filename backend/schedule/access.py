"""
Access-window computation for the constellation tasking layer.

For each target (lat/lon) and each satellite, find the time intervals
where the satellite can see the target. Geometry is spherical-Earth
with a fixed minimum elevation; that's enough for the demo.

The algorithm: walk a coarse time grid, evaluate the satellite-to-
target elevation, and emit intervals where elevation ≥ min. We refine
edges with a quick bisection so the window boundaries are tight to
the second.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, List, Tuple

import numpy as np

from .constellation import (
    SatelliteSpec, propagate_eci, eci_to_lla, R_EARTH,
)


# ─── Geometry ────────────────────────────────────────────────────────

def _target_ecef(lat_deg: float, lon_deg: float) -> np.ndarray:
    """Spherical-Earth ECEF of a target."""
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    return R_EARTH * np.array([
        math.cos(lat) * math.cos(lon),
        math.cos(lat) * math.sin(lon),
        math.sin(lat),
    ])


def _gmst(when: datetime) -> float:
    # Re-implemented locally to avoid circular import; same formula as
    # constellation._gmst.
    jd = (when - datetime(2000, 1, 1, 12, tzinfo=timezone.utc)).total_seconds() / 86400.0 \
         + 2451545.0
    t = (jd - 2451545.0) / 36525.0
    gmst_sec = (
        67310.548_41
        + (876600.0 * 3600.0 + 8640184.812866) * t
        + 0.093_104 * t * t
        - 6.2e-6 * t * t * t
    )
    return (math.radians(gmst_sec * 360.0 / 86400.0)) % (2 * math.pi)


def _eci_to_ecef(r_eci: np.ndarray, when: datetime) -> np.ndarray:
    g = _gmst(when)
    cos_g, sin_g = math.cos(g), math.sin(g)
    return np.array([
        cos_g * r_eci[0] + sin_g * r_eci[1],
        -sin_g * r_eci[0] + cos_g * r_eci[1],
        r_eci[2],
    ])


def elevation_deg(sat: SatelliteSpec, target_lla: tuple, when: datetime) -> float:
    """Elevation (deg) of a satellite as seen from a target."""
    lat_deg, lon_deg = target_lla[0], target_lla[1]
    tgt = _target_ecef(lat_deg, lon_deg)
    sat_ecef = _eci_to_ecef(propagate_eci(sat, when), when)
    rho = sat_ecef - tgt
    # Local up vector at the target (spherical Earth)
    up = tgt / np.linalg.norm(tgt)
    cos_zen = float(np.dot(rho, up) / (np.linalg.norm(rho) * np.linalg.norm(up)))
    cos_zen = max(-1.0, min(1.0, cos_zen))
    zen = math.acos(cos_zen)
    return 90.0 - math.degrees(zen)


# ─── Windows ─────────────────────────────────────────────────────────

@dataclass
class AccessWindow:
    sat_id: str
    target_id: str
    start: datetime
    stop: datetime
    max_elevation_deg: float

    @property
    def duration_sec(self) -> float:
        return (self.stop - self.start).total_seconds()


def _bisect_edge(sat, target_lla, t_lo, t_hi, min_el_deg, target_above: bool,
                 tol_sec: float = 1.0) -> datetime:
    """Bisect for the moment elevation crosses min_el_deg."""
    while (t_hi - t_lo).total_seconds() > tol_sec:
        mid = t_lo + (t_hi - t_lo) / 2
        el = elevation_deg(sat, target_lla, mid)
        above = el >= min_el_deg
        if above == target_above:
            t_hi = mid
        else:
            t_lo = mid
    return t_hi if target_above else t_lo


def compute_access(sat: SatelliteSpec, target_id: str, lat_deg: float, lon_deg: float,
                   t_start: datetime, t_stop: datetime,
                   min_elevation_deg: float = 10.0,
                   step_sec: float = 30.0) -> List[AccessWindow]:
    """Return access windows for one (sat, target) pair across [t_start, t_stop]."""
    target_lla = (lat_deg, lon_deg)
    if t_stop <= t_start:
        return []
    n = int((t_stop - t_start).total_seconds() / step_sec) + 1
    windows: List[AccessWindow] = []
    in_pass = False
    enter_lo = enter_hi = None
    pass_max = -90.0

    for i in range(n + 1):
        when = t_start + timedelta(seconds=i * step_sec)
        if when > t_stop:
            when = t_stop
        el = elevation_deg(sat, target_lla, when)
        above = el >= min_elevation_deg
        if above and not in_pass:
            in_pass = True
            enter_lo = when - timedelta(seconds=step_sec)
            enter_hi = when
            pass_max = el
        elif above and in_pass:
            if el > pass_max:
                pass_max = el
        elif (not above) and in_pass:
            # Exit edge — bisect entry + exit
            exit_lo = when - timedelta(seconds=step_sec)
            exit_hi = when
            entry = _bisect_edge(sat, target_lla,
                                 max(enter_lo, t_start), enter_hi,
                                 min_elevation_deg, target_above=True)
            exitt = _bisect_edge(sat, target_lla,
                                 exit_lo, min(exit_hi, t_stop),
                                 min_elevation_deg, target_above=False)
            if exitt > entry:
                windows.append(AccessWindow(
                    sat_id=sat.sat_id, target_id=target_id,
                    start=entry, stop=exitt, max_elevation_deg=pass_max,
                ))
            in_pass = False
            pass_max = -90.0
        if when >= t_stop:
            break

    if in_pass:
        entry = _bisect_edge(sat, target_lla,
                             max(enter_lo, t_start), enter_hi,
                             min_elevation_deg, target_above=True)
        if t_stop > entry:
            windows.append(AccessWindow(
                sat_id=sat.sat_id, target_id=target_id,
                start=entry, stop=t_stop, max_elevation_deg=pass_max,
            ))
    return windows


def all_access(sats: Iterable[SatelliteSpec], targets: Iterable[dict],
               horizon_start: datetime, horizon_stop: datetime,
               min_elevation_deg: float = 10.0) -> List[AccessWindow]:
    """All access windows for (sat × target) across the horizon."""
    out: List[AccessWindow] = []
    for sat in sats:
        for tgt in targets:
            out.extend(compute_access(
                sat, tgt["request_id"], tgt["lat_deg"], tgt["lon_deg"],
                horizon_start, horizon_stop,
                min_elevation_deg=min_elevation_deg,
            ))
    return out
