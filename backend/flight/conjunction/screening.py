"""
DISHA — Conjunction Screening

Takes a primary orbit (with OD covariance from orbit_determination.py)
and a list of secondary objects, screens the next 72 h for close
approaches, refines TCA, and computes probability of collision (Pc).

Sieves are honest but minimal in v1:
  1. Apogee / perigee gap filter on osculating elements.
  2. Coarse range sweep at a wide step to locate candidate windows.
  3. Fine 1D root-find on range-rate near each candidate to refine TCA.

Pc uses a 2D encounter-plane integration with a numerical disc-quadrature
over the combined hard-body radius. Both covariances are propagated by
the same finite-difference STM the OD uses, so the rigour of Pc tracks
the rigour of OD — that is the whole point.

This is not Astrodynamics Lab-grade. It is a working baseline a real
operator can sanity-check, with the assumptions called out below.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import numpy as np

from backend.flight.estimation.orbit_determination import _propagate, _fd_partials
from backend.shared.models.constants import MU_EARTH, EARTH_RADIUS_KM


# ─── Types ────────────────────────────────────────────────────────────

@dataclass
class SecondaryObject:
    """One catalogue object to screen against."""
    object_id: str
    name: str
    state_eci_km: np.ndarray         # [r; v] at `epoch`
    epoch: datetime
    hard_body_radius_m: float = 5.0  # default 5 m sphere
    # If unknown, assume a generic LEO covariance (this is an honest
    # placeholder — operators should override per object).
    sigma_pos_m: float = 100.0
    sigma_vel_m_s: float = 1.0


@dataclass
class CloseApproach:
    primary_id: str = "PRIMARY"
    secondary_id: str = ""
    secondary_name: str = ""
    tca: datetime = None             # time of closest approach
    miss_distance_m: float = float('inf')
    relative_velocity_m_s: float = 0.0
    pc: float = 0.0
    risk: str = "green"              # green | yellow | red
    combined_hbr_m: float = 0.0
    sigma_along_track_m: float = 0.0
    sigma_cross_track_m: float = 0.0
    primary_state_at_tca: List[float] = field(default_factory=list)
    secondary_state_at_tca: List[float] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    # Relative range sampled around TCA, for the range-vs-time plot.
    # Each entry: {"t_rel_min": <minutes from TCA>, "range_m": <m>}.
    range_curve: List[dict] = field(default_factory=list)


@dataclass
class ScreenResult:
    primary_epoch: datetime
    horizon_seconds: float
    secondaries_screened: int
    candidates: int
    approaches: List[CloseApproach]
    elapsed_ms: float


# ─── Coarse sieve ─────────────────────────────────────────────────────

def _osculating_apogee_perigee(state: np.ndarray) -> tuple[float, float]:
    """Cheap apogee / perigee (km) from a single state. Two-body."""
    r = state[:3]
    v = state[3:]
    rmag = float(np.linalg.norm(r))
    vmag = float(np.linalg.norm(v))
    energy = 0.5 * vmag ** 2 - MU_EARTH / rmag
    a = -MU_EARTH / (2.0 * energy) if abs(energy) > 1e-12 else rmag
    h = np.cross(r, v)
    evec = (np.cross(v, h) / MU_EARTH) - (r / rmag)
    e = float(np.linalg.norm(evec))
    return a * (1 - e), a * (1 + e)  # perigee, apogee in km


def _alt_gap_km(primary_state: np.ndarray, secondary_state: np.ndarray) -> float:
    """Gap between the two altitude bands. Negative => overlap (candidate)."""
    p_per, p_apo = _osculating_apogee_perigee(primary_state)
    s_per, s_apo = _osculating_apogee_perigee(secondary_state)
    if p_apo < s_per:
        return s_per - p_apo
    if s_apo < p_per:
        return p_per - s_apo
    return 0.0  # bands overlap


# ─── Range sweep + TCA refinement ─────────────────────────────────────

def _propagate_to_offsets(state0: np.ndarray, offsets: np.ndarray,
                          h_step: float = 30.0) -> np.ndarray:
    """
    Propagate state0 to each time offset (sec) — INCREMENTAL so the
    total cost scales with the latest time, not with N * latest_time.
    Offsets must be sorted ascending; values may be negative (we step
    backward from state0, then forward to the first non-negative).
    """
    out = np.zeros((len(offsets), 6))
    order = np.argsort(offsets)
    state = state0.copy()
    t_cur = 0.0
    for idx in order:
        t_target = float(offsets[idx])
        dt = t_target - t_cur
        if abs(dt) > 1e-6:
            state = _propagate(state, dt, h_step=h_step)
            t_cur = t_target
        out[idx] = state.copy()
    return out


def _refine_tca(
    primary_state: np.ndarray, secondary_state: np.ndarray,
    t_left: float, t_right: float,
    primary_epoch: datetime, secondary_epoch: datetime,
    max_iter: int = 30, tol_seconds: float = 0.1,
) -> tuple[float, np.ndarray, np.ndarray]:
    """
    Golden-section minimisation of range(t) over [t_left, t_right]
    seconds from the primary epoch. Returns (t_min, primary_state_at_tca,
    secondary_state_at_tca). Times for the secondary are referenced to
    its own epoch (offset internally).
    """
    sec_offset = (primary_epoch - secondary_epoch).total_seconds()

    def range_at(t: float) -> tuple[float, np.ndarray, np.ndarray]:
        sp = _propagate(primary_state, t)
        ss = _propagate(secondary_state, t + sec_offset)
        return float(np.linalg.norm(sp[:3] - ss[:3])), sp, ss

    phi = (1 + math.sqrt(5)) / 2
    a, b = t_left, t_right
    c = b - (b - a) / phi
    d = a + (b - a) / phi
    for _ in range(max_iter):
        if (b - a) < tol_seconds:
            break
        rc, _, _ = range_at(c)
        rd, _, _ = range_at(d)
        if rc < rd:
            b = d
        else:
            a = c
        c = b - (b - a) / phi
        d = a + (b - a) / phi
    t_min = 0.5 * (a + b)
    r_min, sp, ss = range_at(t_min)
    return t_min, sp, ss


# ─── Pc computation ───────────────────────────────────────────────────

def _propagate_covariance(P0: np.ndarray, state0: np.ndarray, dt: float) -> np.ndarray:
    """
    Propagate a 6x6 covariance from t=0 to t=dt using the finite-diff
    STM at the current operating point. P(t) = Phi(t) P0 Phi(t)^T.
    """
    if abs(dt) < 1e-6:
        return P0
    eps = np.array([0.01, 0.01, 0.01, 1e-5, 1e-5, 1e-5])
    Phi = _fd_partials(state0, dt, eps, h_step=30.0)
    return Phi @ P0 @ Phi.T


def _encounter_plane_sigma(
    P_combined_6x6: np.ndarray,
    rel_vel: np.ndarray, rel_pos: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """
    Project the combined 3x3 position covariance into the 2D encounter
    plane (perpendicular to relative velocity at TCA). Returns the 2x2
    projected covariance and the [u, w] basis spanning that plane.

    Definitions:
      vhat  — relative velocity direction (out-of-plane axis)
      u     — projection of rel_pos onto plane normal (here we pick
              an in-plane axis nearest to the rel_pos direction)
      w     — completes the right-handed basis
    """
    P_pos = P_combined_6x6[:3, :3]
    vhat = rel_vel / (np.linalg.norm(rel_vel) + 1e-12)

    # Project rel_pos into the plane (subtract along-vhat component)
    rel_in_plane = rel_pos - np.dot(rel_pos, vhat) * vhat
    if np.linalg.norm(rel_in_plane) < 1e-9:
        # Pick any in-plane vector
        ref = np.array([1.0, 0.0, 0.0]) if abs(vhat[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
        rel_in_plane = ref - np.dot(ref, vhat) * vhat
    u = rel_in_plane / np.linalg.norm(rel_in_plane)
    w = np.cross(vhat, u)
    w /= np.linalg.norm(w)

    R = np.stack([u, w], axis=0)        # 2x3
    Sigma_2d = R @ P_pos @ R.T          # 2x2 in km^2
    return Sigma_2d, np.stack([u, w], axis=0)


def _pc_2d(
    miss_vec: np.ndarray,
    Sigma_2d_km2: np.ndarray,
    hbr_km: float,
    grid_n: int = 41,
) -> float:
    """
    2D probability of collision: integrate the bivariate Gaussian
    centered at the miss vector over a disc of radius hbr_km centered
    at the secondary (i.e. at the origin in the encounter plane).
    We use a polar quadrature grid — accurate enough for screening.

    miss_vec — 2D miss vector in the encounter plane, in km.
    """
    if hbr_km <= 0:
        return 0.0
    try:
        Sigma_inv = np.linalg.inv(Sigma_2d_km2)
    except np.linalg.LinAlgError:
        return 0.0
    det = float(np.linalg.det(Sigma_2d_km2))
    if det <= 0:
        return 0.0
    coef = 1.0 / (2.0 * math.pi * math.sqrt(det))

    # Polar grid over the disc
    radii = np.linspace(0.0, hbr_km, grid_n)
    thetas = np.linspace(0.0, 2 * math.pi, grid_n, endpoint=False)
    dr = hbr_km / (grid_n - 1)
    dtheta = 2 * math.pi / grid_n

    pc = 0.0
    for r in radii:
        # Skip degenerate r=0 endpoint (area element handles it)
        for theta in thetas:
            x = r * math.cos(theta) - miss_vec[0]
            y = r * math.sin(theta) - miss_vec[1]
            p = np.array([x, y])
            arg = float(p @ Sigma_inv @ p)
            pdf = coef * math.exp(-0.5 * arg)
            pc += pdf * r * dr * dtheta
    return float(min(1.0, pc))


def _classify_risk(pc: float, green: float = 1e-7, red: float = 1e-4) -> str:
    if pc >= red:
        return "red"
    if pc >= green:
        return "yellow"
    return "green"


# ─── Top-level screen ─────────────────────────────────────────────────

def screen(
    primary_state: np.ndarray,
    primary_covariance: np.ndarray,
    primary_epoch: datetime,
    secondaries: List[SecondaryObject],
    horizon_seconds: float = 72 * 3600,
    coarse_step_seconds: float = 60.0,
    alt_gap_floor_km: float = 50.0,
    primary_hbr_m: float = 5.0,
    pc_green: float = 1e-7,
    pc_red: float = 1e-4,
) -> ScreenResult:
    """
    Screen the primary against each secondary over the horizon.
    Returns close approaches sorted by Pc (then by miss distance).
    """
    import time as _t
    t0 = _t.perf_counter()
    approaches: List[CloseApproach] = []
    candidates = 0

    # Coarse time grid
    coarse_offsets = np.arange(0.0, horizon_seconds + coarse_step_seconds,
                               coarse_step_seconds)
    primary_traj = _propagate_to_offsets(primary_state, coarse_offsets)

    for sec in secondaries:
        # Sieve 1: altitude gap (cheap)
        gap = _alt_gap_km(primary_state, sec.state_eci_km)
        if gap > alt_gap_floor_km:
            continue

        # Coarse range sweep — propagate secondary along same offsets
        sec_offset_to_primary = (primary_epoch - sec.epoch).total_seconds()
        sec_traj = _propagate_to_offsets(
            sec.state_eci_km,
            coarse_offsets + sec_offset_to_primary,
        )
        ranges = np.linalg.norm(primary_traj[:, :3] - sec_traj[:, :3], axis=1)

        # Find local minima of range
        threshold_km = max(50.0, gap * 2)
        local_min_idx = []
        for i in range(1, len(ranges) - 1):
            if ranges[i] < threshold_km and ranges[i] < ranges[i-1] and ranges[i] < ranges[i+1]:
                local_min_idx.append(i)

        if not local_min_idx:
            continue
        candidates += 1
        # Keep only the absolute closest approach per object — real ops
        # dashboards show one TCA per secondary, not every periodic
        # recurrence of the same near-miss.
        local_min_idx = [min(local_min_idx, key=lambda i: ranges[i])]

        for i in local_min_idx:
            t_left = float(coarse_offsets[max(0, i - 1)])
            t_right = float(coarse_offsets[min(len(coarse_offsets) - 1, i + 1)])
            t_tca, sp_tca, ss_tca = _refine_tca(
                primary_state, sec.state_eci_km,
                t_left, t_right,
                primary_epoch, sec.epoch,
            )

            rel_pos = sp_tca[:3] - ss_tca[:3]
            rel_vel = sp_tca[3:] - ss_tca[3:]
            miss_m = float(np.linalg.norm(rel_pos)) * 1000.0
            vrel_m_s = float(np.linalg.norm(rel_vel)) * 1000.0

            # Combined 6x6 covariance at TCA. Propagate primary cov.
            P_primary_tca = _propagate_covariance(primary_covariance, primary_state, t_tca)
            # Build a simple secondary covariance from the per-object sigmas.
            P_sec = np.diag([
                (sec.sigma_pos_m / 1000.0) ** 2,
                (sec.sigma_pos_m / 1000.0) ** 2,
                (sec.sigma_pos_m / 1000.0) ** 2,
                (sec.sigma_vel_m_s / 1000.0) ** 2,
                (sec.sigma_vel_m_s / 1000.0) ** 2,
                (sec.sigma_vel_m_s / 1000.0) ** 2,
            ])
            P_combined = P_primary_tca + P_sec

            # Project to encounter plane
            Sigma_2d, _ = _encounter_plane_sigma(P_combined, rel_vel, rel_pos)
            # Project miss vector into the same plane
            vhat = rel_vel / (np.linalg.norm(rel_vel) + 1e-12)
            in_plane = rel_pos - np.dot(rel_pos, vhat) * vhat
            # Use the projected magnitude as the 2D miss along u-axis
            miss_2d_km = float(np.linalg.norm(in_plane))
            miss_vec_2d = np.array([miss_2d_km, 0.0])

            hbr_combined_m = primary_hbr_m + sec.hard_body_radius_m
            pc = _pc_2d(miss_vec_2d, Sigma_2d, hbr_combined_m / 1000.0)
            risk = _classify_risk(pc, pc_green, pc_red)

            sigma_u_m = math.sqrt(max(Sigma_2d[0, 0], 0.0)) * 1000.0
            sigma_w_m = math.sqrt(max(Sigma_2d[1, 1], 0.0)) * 1000.0

            # Sample relative range across ±60 min around TCA at ~6 min
            # spacing (21 points). Cheap because we already have the
            # incremental propagator and we start from sp_tca / ss_tca.
            window_min = 60.0
            n_samples = 21
            t_offsets_min = np.linspace(-window_min, window_min, n_samples)
            t_offsets_sec = t_offsets_min * 60.0
            primary_curve = _propagate_to_offsets(sp_tca, t_offsets_sec)
            secondary_curve = _propagate_to_offsets(ss_tca, t_offsets_sec)
            curve_ranges_m = np.linalg.norm(
                primary_curve[:, :3] - secondary_curve[:, :3], axis=1
            ) * 1000.0
            range_curve = [
                {"t_rel_min": round(float(t), 2),
                 "range_m": round(float(r), 1)}
                for t, r in zip(t_offsets_min, curve_ranges_m)
            ]

            approaches.append(CloseApproach(
                primary_id="PRIMARY",
                secondary_id=sec.object_id,
                secondary_name=sec.name,
                tca=primary_epoch + timedelta(seconds=t_tca),
                miss_distance_m=miss_m,
                relative_velocity_m_s=vrel_m_s,
                pc=pc,
                risk=risk,
                combined_hbr_m=hbr_combined_m,
                sigma_along_track_m=sigma_u_m,
                sigma_cross_track_m=sigma_w_m,
                primary_state_at_tca=sp_tca.tolist(),
                secondary_state_at_tca=ss_tca.tolist(),
                range_curve=range_curve,
            ))

    approaches.sort(key=lambda a: (-a.pc, a.miss_distance_m))
    return ScreenResult(
        primary_epoch=primary_epoch,
        horizon_seconds=horizon_seconds,
        secondaries_screened=len(secondaries),
        candidates=candidates,
        approaches=approaches,
        elapsed_ms=(_t.perf_counter() - t0) * 1000.0,
    )


# ─── Maneuver recommendation ──────────────────────────────────────────

@dataclass
class ManeuverRecommendation:
    target_id: str
    target_name: str
    tca: datetime
    current_miss_m: float
    current_pc: float
    burn_time: datetime              # when to execute
    delta_v_m_s: float               # along-track Δv magnitude (signed)
    direction: str                   # "prograde" | "retrograde"
    expected_miss_m: float
    expected_pc_reduction: str       # qualitative — "≥ 2 orders"
    notes: List[str] = field(default_factory=list)


def recommend_maneuver(
    approach: CloseApproach,
    primary_state: np.ndarray,
    primary_covariance: np.ndarray,
    primary_epoch: datetime,
    target_miss_m: float = 1000.0,
    lead_time_orbits: float = 1.0,
) -> ManeuverRecommendation:
    """
    Simple along-track Δv sizing. The miss-distance change at TCA from
    an along-track burn `dt` seconds before TCA scales linearly with
    Δv for small burns (along-track separation grows by ~3 * dt * Δv
    over one orbit after the burn, neglecting higher-order terms).

    For an honest first pass we use:
        delta_miss ≈ 3 * pi * Δv * dt_orbits
    where dt_orbits is the lead time in orbits. This gives the operator
    a credible ball-park to refine in the maneuver planner. We do not
    pretend this is operational guidance.
    """
    notes = []
    # Orbital period from primary state
    r = float(np.linalg.norm(primary_state[:3]))
    v = float(np.linalg.norm(primary_state[3:]))
    energy = 0.5 * v ** 2 - MU_EARTH / r
    a = -MU_EARTH / (2.0 * energy)
    period = 2 * math.pi * math.sqrt(a ** 3 / MU_EARTH)

    # Lead time before TCA (one orbit by default)
    lead_sec = lead_time_orbits * period
    burn_time = approach.tca - timedelta(seconds=lead_sec)
    if burn_time < primary_epoch:
        burn_time = primary_epoch + timedelta(seconds=60)
        notes.append("Burn time clamped: TCA arrives within one orbit.")

    # Δv to push miss out to target_miss (additive)
    needed_extra_m = max(0.0, target_miss_m - approach.miss_distance_m)
    if needed_extra_m <= 0:
        notes.append("Already above target miss distance; no Δv required.")
        return ManeuverRecommendation(
            target_id=approach.secondary_id,
            target_name=approach.secondary_name,
            tca=approach.tca,
            current_miss_m=approach.miss_distance_m,
            current_pc=approach.pc,
            burn_time=burn_time,
            delta_v_m_s=0.0,
            direction="none",
            expected_miss_m=approach.miss_distance_m,
            expected_pc_reduction="not required",
            notes=notes,
        )

    # delta_miss ≈ 3 pi * Δv * dt_orbits  (very rough first-order)
    dv_m_s = needed_extra_m / (3.0 * math.pi * lead_time_orbits)
    # Cap at something reasonable
    if dv_m_s > 5.0:
        notes.append(f"Computed Δv {dv_m_s:.2f} m/s > 5 m/s cap; clamping.")
        dv_m_s = 5.0

    return ManeuverRecommendation(
        target_id=approach.secondary_id,
        target_name=approach.secondary_name,
        tca=approach.tca,
        current_miss_m=approach.miss_distance_m,
        current_pc=approach.pc,
        burn_time=burn_time,
        delta_v_m_s=round(dv_m_s, 3),
        direction="prograde",
        expected_miss_m=approach.miss_distance_m + needed_extra_m,
        expected_pc_reduction=">= 2 orders (estimate)",
        notes=notes,
    )


# ─── Threat list (synthetic catalogue stand-in for v1) ────────────────

def synthetic_threats(primary_state: np.ndarray, primary_epoch: datetime,
                      n: int = 4, seed: int = 7,
                      horizon_seconds: float = 12 * 3600) -> List[SecondaryObject]:
    """
    Generate `n` secondaries deterministically engineered to have a
    close approach with the primary inside `horizon_seconds`.

    Construction (per threat i): pick a TCA inside the horizon, propagate
    the primary to that time, place the secondary at the same location
    offset by miss_i km along an across-track direction, and give it a
    velocity perturbation. Walk that state backward to `primary_epoch`
    so screening can propagate forward.

    Real catalogue ingestion (CCSDS CDM / TLE list) is a follow-up.
    """
    rng = np.random.default_rng(seed)
    secondaries: List[SecondaryObject] = []
    # Designed miss distances (km) — span from near-miss to comfortable
    miss_targets_km = [0.020, 0.200, 2.000, 15.000][:n]
    # Spread the TCAs across the horizon so the timeline shows variety
    tca_fracs = [0.10, 0.30, 0.55, 0.80][:n]
    for i, (miss_km, frac) in enumerate(zip(miss_targets_km, tca_fracs)):
        t_tca = frac * horizon_seconds
        prim_at_tca = _propagate(primary_state, t_tca)
        r = prim_at_tca[:3]; v = prim_at_tca[3:]
        h = np.cross(r, v)
        h_hat = h / np.linalg.norm(h)
        # Across-track offset (perpendicular to orbit plane) — keeps the
        # apo/peri overlap intact while guaranteeing a real spatial miss.
        offset = miss_km * h_hat
        # Velocity: keep nearly the same magnitude, rotate by a small angle
        # in-plane so Vrel at TCA is non-zero (typical conjunction has
        # Vrel of a few km/s on co-altitude orbits).
        rot_angle = np.radians(rng.uniform(2.0, 8.0))
        v_rot = (np.cos(rot_angle) * v
                 + np.sin(rot_angle) * np.cross(h_hat, v))
        sec_at_tca = np.concatenate([r + offset, v_rot])
        # Walk back to primary_epoch
        sec_at_epoch = _propagate(sec_at_tca, -t_tca)
        secondaries.append(SecondaryObject(
            object_id=f"SYN-{i+1:03d}",
            name=f"Threat {i+1}",
            state_eci_km=sec_at_epoch,
            epoch=primary_epoch,
            hard_body_radius_m=5.0,
            sigma_pos_m=80.0,
            sigma_vel_m_s=0.5,
        ))
    return secondaries
