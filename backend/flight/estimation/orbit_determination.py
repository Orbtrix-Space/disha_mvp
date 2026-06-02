"""
DISHA — Orbit Determination

Batch weighted least squares (Gauss-Newton) OD on time-tagged position
fixes (GPS point solutions). Force model is two-body + J2 — reuses the
existing rk4_step in flight_dynamics.py for nominal trajectory and for
the state-transition partials via finite differences.

State: x0 = [r0; v0] at the chosen reference epoch (default: arc midpoint).
Measurements: position fixes y_k = r(t_k) at times t_k.
Measurement model: y_k = [I_3 | 0_3] · phi(x0, t_k - t0)
Normal equations: (sum H_k^T W H_k) dx = sum H_k^T W (y_k - h(x0, t_k))
Covariance: P = (sum H_k^T W H_k)^{-1}

This is not a textbook-precise OD — it is an honest working batch LSQ
that converges on real GPS-like data and produces a real covariance.
Drag / SRP / third-body / analytical partials are explicit follow-ups.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional

import numpy as np

from backend.shared.dynamics.propagator import rk4_step


# ─── Types ────────────────────────────────────────────────────────────

@dataclass
class GPSFix:
    """One time-tagged position (and optional velocity) fix."""
    epoch: datetime
    position_km: np.ndarray       # shape (3,)
    velocity_km_s: Optional[np.ndarray] = None  # shape (3,), optional
    sigma_pos_km: float = 0.005   # per-axis 1-sigma, default 5 m

    def t_offset(self, t0: datetime) -> float:
        return (self.epoch - t0).total_seconds()


@dataclass
class ODResult:
    converged: bool
    iterations: int
    rms_residual_m: float
    fit_arc_seconds: float
    n_observations: int
    epoch: datetime
    state_eci_km: np.ndarray         # shape (6,): r and v
    covariance: np.ndarray           # shape (6,6) in km, km/s units
    covariance_condition: float      # cond(P) — health metric
    sigma_pos_m: float               # sqrt(trace(P[:3,:3])) in metres
    sigma_vel_m_s: float             # sqrt(trace(P[3:,3:])) in m/s
    elapsed_ms: float
    method: str = "batch_lsq_j2"
    notes: List[str] = field(default_factory=list)
    # Diagnostics for the fit-quality plots on the Flight page.
    rms_history_m: List[float] = field(default_factory=list)  # one per iteration
    fix_times_s: List[float] = field(default_factory=list)    # (N,) seconds from epoch
    post_fit_residuals_m: List[List[float]] = field(default_factory=list)
    # ^ (N, 3) per-fix residual in ECI XYZ, metres, AFTER the final iter.


# ─── Propagator wrapper ───────────────────────────────────────────────

def _propagate(state0: np.ndarray, dt: float, h_step: float = 30.0) -> np.ndarray:
    """
    Propagate a 6-state from t=0 to t=dt using RK4 with two-body+J2.
    Returns the new 6-state. Adaptive step is left as future work; for
    OD arcs of minutes-to-hours, fixed 30 s steps with bisection on the
    last leg works well.
    """
    if dt == 0.0:
        return state0.copy()
    sign = 1.0 if dt > 0 else -1.0
    dt = abs(dt)
    state = state0.copy()
    n_full = int(dt // h_step)
    rem = dt - n_full * h_step
    for _ in range(n_full):
        state = rk4_step(state, sign * h_step)
    if rem > 1e-6:
        state = rk4_step(state, sign * rem)
    return state


def _propagate_to_times(state0: np.ndarray, times_sec: List[float],
                        h_step: float = 30.0) -> np.ndarray:
    """
    Propagate state0 to each time in `times_sec`. Times can be
    negative (before epoch) or positive. Returns an (N, 6) array.

    This is the inner-loop bottleneck. For honesty we use a forward
    sweep from the earliest time to the latest, restarting from state0
    for each direction. Not the fastest, but correct.
    """
    out = np.zeros((len(times_sec), 6))
    for i, t in enumerate(times_sec):
        out[i] = _propagate(state0, t, h_step=h_step)
    return out


# ─── Least squares ────────────────────────────────────────────────────

def _fd_partials(state0: np.ndarray, time_sec: float,
                 eps: np.ndarray, h_step: float) -> np.ndarray:
    """
    Finite-difference state-transition partials d phi(x0, t)/d x0,
    returned as a 6x6 matrix. Central differences.
    """
    Phi = np.zeros((6, 6))
    for j in range(6):
        e = np.zeros(6)
        e[j] = eps[j]
        plus = _propagate(state0 + e, time_sec, h_step=h_step)
        minus = _propagate(state0 - e, time_sec, h_step=h_step)
        Phi[:, j] = (plus - minus) / (2.0 * eps[j])
    return Phi


def _initial_guess(fixes: List[GPSFix], epoch: datetime) -> np.ndarray:
    """
    Cheap initial guess: take the fix nearest the epoch for position,
    and finite-difference the two fixes bracketing it for velocity.
    Good enough to start Gauss-Newton on a clean arc.
    """
    sorted_fixes = sorted(fixes, key=lambda f: f.epoch)
    times = np.array([f.t_offset(epoch) for f in sorted_fixes])
    nearest = int(np.argmin(np.abs(times)))
    r0 = sorted_fixes[nearest].position_km.copy()

    # Pick neighbours for differencing
    if 0 < nearest < len(sorted_fixes) - 1:
        a = sorted_fixes[nearest - 1]
        b = sorted_fixes[nearest + 1]
    elif nearest == 0:
        a = sorted_fixes[0]
        b = sorted_fixes[1]
    else:
        a = sorted_fixes[-2]
        b = sorted_fixes[-1]

    dt = (b.epoch - a.epoch).total_seconds()
    v0 = (b.position_km - a.position_km) / dt if dt > 0 else np.zeros(3)

    # If the fix carried a velocity, trust it
    if sorted_fixes[nearest].velocity_km_s is not None:
        v0 = sorted_fixes[nearest].velocity_km_s.copy()

    return np.concatenate([r0, v0])


def determine_orbit(
    fixes: List[GPSFix],
    epoch: Optional[datetime] = None,
    max_iter: int = 12,
    convergence_pos_m: float = 0.1,
    h_step: float = 30.0,
) -> ODResult:
    """
    Run batch weighted LSQ on the given GPS fixes.

    The reference epoch defaults to the arc midpoint, which keeps
    propagation distances small in both directions and improves
    numerical conditioning vs. propagating from the earliest fix.
    """
    if len(fixes) < 3:
        raise ValueError("Need at least 3 GPS fixes for batch LSQ.")

    t0 = time.perf_counter()
    sorted_fixes = sorted(fixes, key=lambda f: f.epoch)
    if epoch is None:
        mid_ts = 0.5 * (
            sorted_fixes[0].epoch.timestamp() + sorted_fixes[-1].epoch.timestamp()
        )
        epoch = datetime.fromtimestamp(mid_ts, tz=timezone.utc)
    arc_seconds = (sorted_fixes[-1].epoch - sorted_fixes[0].epoch).total_seconds()

    # Stack observations
    times = np.array([f.t_offset(epoch) for f in sorted_fixes])
    y_obs = np.stack([f.position_km for f in sorted_fixes], axis=0)  # (N, 3)
    sig = np.array([f.sigma_pos_km for f in sorted_fixes])           # (N,)
    inv_sig2 = 1.0 / (sig ** 2)                                       # per-obs weight scalar

    # Perturbation sizes for the finite-difference STM. Position ~ 10 m,
    # velocity ~ 1 cm/s — large enough to dominate float noise, small
    # enough to stay in the linear regime.
    eps = np.array([0.01, 0.01, 0.01, 1e-5, 1e-5, 1e-5])

    x = _initial_guess(sorted_fixes, epoch)
    notes: List[str] = []
    converged = False
    rms_m = float('inf')
    info_matrix = np.eye(6) * 1e-12  # avoid uninitialized referencing
    rms_history: List[float] = []
    final_residuals_km: np.ndarray = np.zeros_like(y_obs)

    for it in range(1, max_iter + 1):
        # Nominal predicted positions at each obs time
        preds = _propagate_to_times(x, times.tolist(), h_step=h_step)  # (N, 6)
        residuals = y_obs - preds[:, :3]                                # (N, 3)
        final_residuals_km = residuals                                  # tracked for post-fit

        # Build normal equations
        normal = np.zeros((6, 6))
        rhs = np.zeros(6)
        for i, t in enumerate(times):
            Phi = _fd_partials(x, float(t), eps, h_step)               # 6x6
            H = Phi[:3, :]                                              # 3x6
            w = inv_sig2[i]
            normal += w * (H.T @ H)
            rhs += w * (H.T @ residuals[i])

        info_matrix = normal
        try:
            dx = np.linalg.solve(normal, rhs)
        except np.linalg.LinAlgError:
            notes.append(f"Normal equations singular at iter {it}.")
            break

        x = x + dx

        rms_m = float(np.sqrt(np.mean(residuals ** 2)) * 1000.0)
        rms_history.append(round(rms_m, 4))
        if (np.linalg.norm(dx[:3]) * 1000.0) < convergence_pos_m:
            converged = True
            # One final propagation with the converged state for honest
            # post-fit residuals (the loop's `residuals` are pre-update).
            preds_final = _propagate_to_times(x, times.tolist(), h_step=h_step)
            final_residuals_km = y_obs - preds_final[:, :3]
            rms_m = float(np.sqrt(np.mean(final_residuals_km ** 2)) * 1000.0)
            rms_history[-1] = round(rms_m, 4)
            break

    # Recover covariance from the final information matrix
    try:
        P = np.linalg.inv(info_matrix)
    except np.linalg.LinAlgError:
        P = np.full((6, 6), np.nan)
        notes.append("Covariance inversion failed.")

    cond = float(np.linalg.cond(info_matrix))
    sigma_pos_m = float(np.sqrt(np.trace(P[:3, :3])) * 1000.0)
    sigma_vel_m_s = float(np.sqrt(np.trace(P[3:, 3:])) * 1000.0)

    return ODResult(
        converged=converged,
        iterations=it,
        rms_residual_m=rms_m,
        fit_arc_seconds=arc_seconds,
        n_observations=len(sorted_fixes),
        epoch=epoch,
        state_eci_km=x,
        covariance=P,
        covariance_condition=cond,
        sigma_pos_m=sigma_pos_m,
        sigma_vel_m_s=sigma_vel_m_s,
        elapsed_ms=(time.perf_counter() - t0) * 1000.0,
        method="batch_lsq_j2",
        notes=notes,
        rms_history_m=rms_history,
        fix_times_s=[float(t) for t in times.tolist()],
        post_fit_residuals_m=[
            [float(c * 1000.0) for c in row] for row in final_residuals_km
        ],
    )


# ─── CSV parsing ──────────────────────────────────────────────────────

def parse_gps_csv(text: str, default_sigma_m: float = 5.0,
                  default_frame: str = "ECI") -> List[GPSFix]:
    """
    Parse a CSV string of GPS fixes. Required columns: epoch, x, y, z.
    Optional: vx, vy, vz. Frame is assumed already ECI for v1 — ECEF
    rotation is handled externally before this function runs.

    Header row is detected by 'epoch' appearing in the first column.
    Unit assumption: x/y/z in km, vx/vy/vz in km/s. Epoch is parsed by
    `datetime.fromisoformat`; supports trailing 'Z'.
    """
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    if not lines:
        return []
    # Skip header if present
    if 'epoch' in lines[0].lower():
        lines = lines[1:]

    fixes: List[GPSFix] = []
    sigma_km = default_sigma_m / 1000.0
    for ln in lines:
        parts = [p.strip() for p in ln.split(',') if p.strip()]
        if len(parts) < 4:
            continue
        epoch_str = parts[0].replace('Z', '+00:00')
        try:
            epoch = datetime.fromisoformat(epoch_str)
        except ValueError:
            continue
        if epoch.tzinfo is None:
            epoch = epoch.replace(tzinfo=timezone.utc)
        try:
            x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
        except ValueError:
            continue
        vel = None
        if len(parts) >= 7:
            try:
                vel = np.array([float(parts[4]), float(parts[5]), float(parts[6])])
            except ValueError:
                vel = None
        fixes.append(GPSFix(
            epoch=epoch,
            position_km=np.array([x, y, z]),
            velocity_km_s=vel,
            sigma_pos_km=sigma_km,
        ))
    return fixes


def synthesize_gps_arc(state0: np.ndarray, epoch: datetime,
                       n_fixes: int = 20, span_seconds: float = 600.0,
                       noise_m: float = 5.0,
                       seed: int = 1) -> List[GPSFix]:
    """
    Build a synthetic GPS arc by propagating a known state and adding
    Gaussian noise. Used by the smoke test and demo when no real GPS
    file is on hand.
    """
    rng = np.random.default_rng(seed)
    times = np.linspace(0.0, span_seconds, n_fixes)
    fixes: List[GPSFix] = []
    for t in times:
        true_state = _propagate(state0, float(t))
        noise = rng.normal(scale=noise_m / 1000.0, size=3)
        fixes.append(GPSFix(
            epoch=epoch.fromtimestamp(epoch.timestamp() + float(t), tz=timezone.utc),
            position_km=true_state[:3] + noise,
            velocity_km_s=true_state[3:].copy(),
            sigma_pos_km=noise_m / 1000.0,
        ))
    return fixes
