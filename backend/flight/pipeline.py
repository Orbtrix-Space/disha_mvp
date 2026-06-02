"""
DISHA — Flight Operations Pipeline

Orchestrates the end-to-end automated ops chain:

    Ingest GPS  →  OD  →  Propagate (implicit, inside Screen)
                →  Screen  →  Risk Assess  →  Maneuver Recommend

Each stage records its status, elapsed time, and any structured output
on a shared `PipelineRun` object. The frontend reads this object via
the /flight/pipeline endpoints to render the status strip and outputs.

The pipeline is single-instance for now (one primary spacecraft).
Re-running it replaces the previous run.

Nothing in this module commands the spacecraft. Maneuver recommendations
are stored and surfaced for operator approval; auto-execute is out of
scope on purpose.
"""

from __future__ import annotations

import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import List, Optional

import numpy as np

from backend.flight.estimation.orbit_determination import (
    GPSFix, ODResult, determine_orbit, parse_gps_csv,
)
from backend.flight.conjunction.screening import (
    CloseApproach, ManeuverRecommendation, SecondaryObject, ScreenResult,
    recommend_maneuver, screen, synthetic_threats,
)


# ─── State containers ─────────────────────────────────────────────────

STAGE_ORDER = ("ingest", "od", "screen", "assess", "recommend")
STAGE_LABEL = {
    "ingest":   "Ingest GPS",
    "od":       "Orbit determination",
    "screen":   "Conjunction screen",
    "assess":   "Risk assessment",
    "recommend":"Maneuver recommendation",
}


@dataclass
class StageState:
    name: str
    label: str
    status: str = "queued"            # queued | running | done | failed | skipped
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    elapsed_ms: float = 0.0
    detail: str = ""


@dataclass
class PipelineEvent:
    t: str                            # UTC ISO
    stage: str
    level: str                        # info | warn | alarm
    message: str


@dataclass
class PipelineRun:
    run_id: str
    created_at: str
    stages: List[StageState] = field(default_factory=list)
    events: List[PipelineEvent] = field(default_factory=list)
    state: str = "idle"               # idle | running | complete | failed
    error: Optional[str] = None
    # Outputs at each stage — kept as plain dicts so they serialise cleanly
    od_result: Optional[dict] = None
    screen_result: Optional[dict] = None
    maneuver: Optional[dict] = None

    def stage(self, name: str) -> StageState:
        for s in self.stages:
            if s.name == name:
                return s
        s = StageState(name=name, label=STAGE_LABEL.get(name, name))
        self.stages.append(s)
        return s

    def event(self, stage: str, level: str, message: str):
        self.events.append(PipelineEvent(
            t=datetime.now(timezone.utc).isoformat(),
            stage=stage, level=level, message=message,
        ))

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "created_at": self.created_at,
            "state": self.state,
            "error": self.error,
            "stages": [asdict(s) for s in self.stages],
            "events": [asdict(e) for e in self.events[-100:]],
            "od_result": self.od_result,
            "screen_result": self.screen_result,
            "maneuver": self.maneuver,
        }


# ─── Serialisation helpers ────────────────────────────────────────────

def _od_to_dict(od: ODResult) -> dict:
    # Per-fix residuals zipped with their epoch offsets for the
    # residuals-vs-time plot. Sigma is the per-fix measurement noise,
    # which is constant across the arc when fed by a single GPS receiver.
    residuals = []
    for t_s, r in zip(od.fix_times_s, od.post_fit_residuals_m):
        x_m, y_m, z_m = r
        residuals.append({
            "t_s": round(float(t_s), 1),
            "x_m": round(x_m, 3),
            "y_m": round(y_m, 3),
            "z_m": round(z_m, 3),
            "norm_m": round(float(np.linalg.norm(r)), 3),
        })
    return {
        "converged": od.converged,
        "iterations": od.iterations,
        "rms_residual_m": round(od.rms_residual_m, 3),
        "fit_arc_seconds": round(od.fit_arc_seconds, 1),
        "n_observations": od.n_observations,
        "epoch": od.epoch.isoformat(),
        "state_eci_km": list(map(float, od.state_eci_km)),
        "sigma_pos_m": round(od.sigma_pos_m, 3),
        "sigma_vel_m_s": round(od.sigma_vel_m_s, 6),
        "covariance_condition": round(od.covariance_condition, 3),
        "elapsed_ms": round(od.elapsed_ms, 1),
        "method": od.method,
        "notes": list(od.notes),
        "orbital_elements": _elements_from_state(od.state_eci_km),
        "rms_history_m": list(od.rms_history_m),
        "residuals": residuals,
    }


def _elements_from_state(state: np.ndarray) -> dict:
    """Classical osculating elements from an ECI state vector."""
    import math
    from backend.shared.models.constants import MU_EARTH
    r = state[:3]
    v = state[3:]
    rmag = float(np.linalg.norm(r))
    vmag = float(np.linalg.norm(v))
    h = np.cross(r, v)
    hmag = float(np.linalg.norm(h))
    energy = 0.5 * vmag ** 2 - MU_EARTH / rmag
    a = -MU_EARTH / (2.0 * energy)
    evec = (np.cross(v, h) / MU_EARTH) - (r / rmag)
    e = float(np.linalg.norm(evec))
    inc = math.degrees(math.acos(max(-1.0, min(1.0, h[2] / hmag))))
    n_vec = np.cross([0, 0, 1], h)
    n_mag = float(np.linalg.norm(n_vec))
    if n_mag > 1e-9:
        raan = math.degrees(math.acos(max(-1.0, min(1.0, n_vec[0] / n_mag))))
        if n_vec[1] < 0:
            raan = 360.0 - raan
        argp = math.degrees(math.acos(max(-1.0, min(1.0,
            float(np.dot(n_vec, evec)) / (n_mag * e + 1e-12)))))
        if evec[2] < 0:
            argp = 360.0 - argp
    else:
        raan = 0.0
        argp = 0.0
    cos_nu = float(np.dot(evec, r) / (e * rmag + 1e-12))
    nu = math.degrees(math.acos(max(-1.0, min(1.0, cos_nu))))
    if float(np.dot(r, v)) < 0:
        nu = 360.0 - nu
    return {
        "semi_major_axis_km": round(a, 3),
        "eccentricity": round(e, 6),
        "inclination_deg": round(inc, 4),
        "raan_deg": round(raan, 4),
        "arg_perigee_deg": round(argp, 4),
        "true_anomaly_deg": round(nu, 4),
        "period_minutes": round(2 * math.pi * math.sqrt(a ** 3 / MU_EARTH) / 60.0, 3),
    }


def _approach_to_dict(ap: CloseApproach) -> dict:
    return {
        "secondary_id": ap.secondary_id,
        "secondary_name": ap.secondary_name,
        "tca": ap.tca.isoformat(),
        "miss_distance_m": round(ap.miss_distance_m, 1),
        "relative_velocity_m_s": round(ap.relative_velocity_m_s, 1),
        "pc": ap.pc,
        "risk": ap.risk,
        "combined_hbr_m": round(ap.combined_hbr_m, 1),
        "sigma_along_track_m": round(ap.sigma_along_track_m, 1),
        "sigma_cross_track_m": round(ap.sigma_cross_track_m, 1),
        "range_curve": list(ap.range_curve),
    }


def _screen_to_dict(sr: ScreenResult) -> dict:
    return {
        "primary_epoch": sr.primary_epoch.isoformat(),
        "horizon_seconds": sr.horizon_seconds,
        "secondaries_screened": sr.secondaries_screened,
        "candidates": sr.candidates,
        "elapsed_ms": round(sr.elapsed_ms, 1),
        "approaches": [_approach_to_dict(a) for a in sr.approaches],
    }


def _maneuver_to_dict(mv: ManeuverRecommendation) -> dict:
    return {
        "target_id": mv.target_id,
        "target_name": mv.target_name,
        "tca": mv.tca.isoformat(),
        "current_miss_m": round(mv.current_miss_m, 1),
        "current_pc": mv.current_pc,
        "burn_time": mv.burn_time.isoformat(),
        "delta_v_m_s": mv.delta_v_m_s,
        "direction": mv.direction,
        "expected_miss_m": round(mv.expected_miss_m, 1),
        "expected_pc_reduction": mv.expected_pc_reduction,
        "status": "PENDING_APPROVAL",
        "notes": list(mv.notes),
    }


# ─── Orchestrator ─────────────────────────────────────────────────────

class FlightPipeline:
    """Single-instance pipeline. Thread-safe enough for the demo."""

    def __init__(self):
        self._lock = threading.Lock()
        self.last_run: Optional[PipelineRun] = None
        # Ingested GPS arc + its config — fed by /flight/ingest_gps
        self.gps_fixes: List[GPSFix] = []
        self.gps_meta: dict = {
            "frame": "ECI",
            "sigma_m": 5.0,
            "source": "none",
        }
        # Optional catalogue of secondaries to screen against. When
        # empty, run() falls back to engineered synthetic threats.
        self.catalog: List[SecondaryObject] = []
        self.catalog_meta: dict = {"source": "none", "count": 0, "names": []}

    def reset(self):
        with self._lock:
            self.last_run = None
            self.gps_fixes = []
            self.gps_meta = {"frame": "ECI", "sigma_m": 5.0, "source": "none"}
            self.catalog = []
            self.catalog_meta = {"source": "none", "count": 0, "names": []}

    # ─── Catalogue (TLE list) management ───────────────────────

    def load_catalog_tle(self, text: str, source: str = "paste") -> dict:
        """
        Parse a multi-TLE text blob (3-line sets, or bare 2-line pairs)
        and store the resulting SecondaryObjects evaluated at "now".
        Returns a small summary for the UI.
        """
        from sgp4.api import Satrec, WGS72, jday
        now = datetime.now(timezone.utc)
        jd, fr = jday(now.year, now.month, now.day,
                      now.hour, now.minute,
                      now.second + now.microsecond / 1e6)
        lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
        objects: List[SecondaryObject] = []
        i = 0
        skipped = 0
        while i < len(lines):
            # 3-line block: name / line1 / line2
            if (i + 2 < len(lines)
                    and lines[i + 1].startswith("1 ")
                    and lines[i + 2].startswith("2 ")):
                name = lines[i].strip()
                l1, l2 = lines[i + 1], lines[i + 2]
                step = 3
            # 2-line block (no name)
            elif (i + 1 < len(lines)
                  and lines[i].startswith("1 ")
                  and lines[i + 1].startswith("2 ")):
                name = ""
                l1, l2 = lines[i], lines[i + 1]
                step = 2
            else:
                i += 1
                continue
            try:
                sat = Satrec.twoline2rv(l1, l2, WGS72)
                err, r, v = sat.sgp4(jd, fr)
                if err != 0:
                    skipped += 1
                    i += step
                    continue
                norad_id = int(l1[2:7])
                objects.append(SecondaryObject(
                    object_id=f"NORAD-{norad_id}",
                    name=name or f"NORAD-{norad_id}",
                    state_eci_km=np.array([*r, *v]),
                    epoch=now,
                ))
            except Exception:
                skipped += 1
            i += step

        if not objects:
            raise ValueError("No valid TLE pairs parsed from input.")

        with self._lock:
            self.catalog = objects
            self.catalog_meta = {
                "source": source,
                "count": len(objects),
                "skipped": skipped,
                "names": [o.name for o in objects[:200]],
                "loaded_at": now.isoformat(),
            }
        return dict(self.catalog_meta)

    def clear_catalog(self) -> None:
        with self._lock:
            self.catalog = []
            self.catalog_meta = {"source": "none", "count": 0, "names": []}

    # ─── Ingest ────────────────────────────────────────────────

    def ingest_csv(self, text: str, sigma_m: float = 5.0,
                   frame: str = "ECI", source: str = "paste") -> dict:
        fixes = parse_gps_csv(text, default_sigma_m=sigma_m)
        if not fixes:
            raise ValueError("No valid GPS fixes parsed from input.")
        with self._lock:
            self.gps_fixes = fixes
            self.gps_meta = {
                "frame": frame, "sigma_m": sigma_m, "source": source,
                "count": len(fixes),
                "span_seconds": (fixes[-1].epoch - fixes[0].epoch).total_seconds(),
                "first_epoch": fixes[0].epoch.isoformat(),
                "last_epoch": fixes[-1].epoch.isoformat(),
            }
        return dict(self.gps_meta)

    def ingest_synthetic(self, primary_state: np.ndarray, primary_epoch: datetime,
                         n_fixes: int = 15, span_seconds: float = 600.0,
                         noise_m: float = 5.0) -> dict:
        from backend.flight.estimation.orbit_determination import synthesize_gps_arc
        fixes = synthesize_gps_arc(primary_state, primary_epoch,
                                   n_fixes=n_fixes, span_seconds=span_seconds,
                                   noise_m=noise_m)
        with self._lock:
            self.gps_fixes = fixes
            self.gps_meta = {
                "frame": "ECI", "sigma_m": noise_m, "source": "synthetic",
                "count": len(fixes),
                "span_seconds": span_seconds,
                "first_epoch": fixes[0].epoch.isoformat(),
                "last_epoch": fixes[-1].epoch.isoformat(),
            }
        return dict(self.gps_meta)

    # ─── Run the chain ─────────────────────────────────────────

    def run(
        self,
        horizon_seconds: float = 24 * 3600,
        coarse_step_seconds: float = 30.0,
        pc_green: float = 1e-7,
        pc_red: float = 1e-4,
        secondaries: Optional[List[SecondaryObject]] = None,
    ) -> PipelineRun:
        run = PipelineRun(
            run_id=f"run-{int(time.time())}",
            created_at=datetime.now(timezone.utc).isoformat(),
            state="running",
        )
        for name in STAGE_ORDER:
            run.stages.append(StageState(name=name, label=STAGE_LABEL[name]))
        self.last_run = run

        try:
            # 1. Ingest stage just reports what's loaded
            st = run.stage("ingest")
            st.status = "running"
            st.started_at = datetime.now(timezone.utc).isoformat()
            t0 = time.perf_counter()
            with self._lock:
                fixes = list(self.gps_fixes)
            if not fixes:
                st.status = "failed"
                st.detail = "No GPS fixes loaded."
                run.event("ingest", "alarm", "No GPS fixes; pipeline halted.")
                run.state = "failed"
                run.error = "no_gps"
                return run
            st.detail = f"{len(fixes)} fixes, arc {(fixes[-1].epoch-fixes[0].epoch).total_seconds():.0f}s"
            st.elapsed_ms = (time.perf_counter() - t0) * 1000.0
            st.finished_at = datetime.now(timezone.utc).isoformat()
            st.status = "done"
            run.event("ingest", "info",
                      f"GPS arc loaded ({len(fixes)} fixes, {self.gps_meta.get('source','?')}).")

            # 2. OD
            st = run.stage("od")
            st.status = "running"
            st.started_at = datetime.now(timezone.utc).isoformat()
            t0 = time.perf_counter()
            od = determine_orbit(fixes)
            st.elapsed_ms = (time.perf_counter() - t0) * 1000.0
            st.finished_at = datetime.now(timezone.utc).isoformat()
            run.od_result = _od_to_dict(od)
            if not od.converged:
                st.status = "failed"
                st.detail = f"Did not converge (RMS {od.rms_residual_m:.1f} m)."
                run.event("od", "alarm", f"OD did not converge after {od.iterations} iter.")
                run.state = "failed"
                run.error = "od_diverged"
                return run
            st.status = "done"
            st.detail = (f"converged in {od.iterations} iter, RMS {od.rms_residual_m:.2f} m, "
                         f"sigma_pos {od.sigma_pos_m:.2f} m")
            run.event("od", "info",
                      f"OD converged. RMS {od.rms_residual_m:.2f} m, sigma_pos {od.sigma_pos_m:.2f} m.")

            # 3. Screen
            st = run.stage("screen")
            st.status = "running"
            st.started_at = datetime.now(timezone.utc).isoformat()
            t0 = time.perf_counter()
            if secondaries is None:
                with self._lock:
                    loaded = list(self.catalog)
                if loaded:
                    secondaries = loaded
                    run.event("screen", "info",
                              f"Using operator catalogue: {len(loaded)} objects.")
                else:
                    secondaries = synthetic_threats(
                        od.state_eci_km, od.epoch,
                        horizon_seconds=horizon_seconds,
                    )
                    run.event("screen", "info",
                              "No catalogue loaded; screening against engineered "
                              "synthetic threats.")
            screen_result = screen(
                od.state_eci_km, od.covariance, od.epoch, secondaries,
                horizon_seconds=horizon_seconds,
                coarse_step_seconds=coarse_step_seconds,
                pc_green=pc_green, pc_red=pc_red,
            )
            st.elapsed_ms = (time.perf_counter() - t0) * 1000.0
            st.finished_at = datetime.now(timezone.utc).isoformat()
            run.screen_result = _screen_to_dict(screen_result)
            st.detail = (f"{screen_result.candidates} candidates / "
                         f"{screen_result.secondaries_screened} objects, "
                         f"{len(screen_result.approaches)} approaches")
            st.status = "done"
            run.event("screen", "info",
                      f"Screened {screen_result.secondaries_screened} objects, "
                      f"{len(screen_result.approaches)} approaches found.")

            # 4. Assess — find worst by Pc, classify
            st = run.stage("assess")
            st.status = "running"
            st.started_at = datetime.now(timezone.utc).isoformat()
            t0 = time.perf_counter()
            worst = screen_result.approaches[0] if screen_result.approaches else None
            if worst is None:
                st.detail = "No close approaches in horizon."
                st.elapsed_ms = (time.perf_counter() - t0) * 1000.0
                st.finished_at = datetime.now(timezone.utc).isoformat()
                st.status = "done"
                run.event("assess", "info", "All-clear: no close approaches.")
                # Skip recommend
                run.stage("recommend").status = "skipped"
                run.stage("recommend").detail = "No threat to mitigate."
                run.state = "complete"
                return run
            st.detail = f"Worst Pc {worst.pc:.2e} ({worst.risk}) vs {worst.secondary_id}"
            st.elapsed_ms = (time.perf_counter() - t0) * 1000.0
            st.finished_at = datetime.now(timezone.utc).isoformat()
            st.status = "done"
            level = {"red": "alarm", "yellow": "warn", "green": "info"}[worst.risk]
            run.event("assess", level,
                      f"Worst conjunction: {worst.secondary_id} Pc {worst.pc:.2e} risk {worst.risk.upper()}.")

            # 5. Recommend — only if not green
            st = run.stage("recommend")
            st.status = "running"
            st.started_at = datetime.now(timezone.utc).isoformat()
            t0 = time.perf_counter()
            if worst.risk == "green":
                st.status = "skipped"
                st.detail = "Below action threshold."
                st.elapsed_ms = (time.perf_counter() - t0) * 1000.0
                st.finished_at = datetime.now(timezone.utc).isoformat()
                run.event("recommend", "info",
                          "No maneuver recommended (worst Pc below green threshold).")
            else:
                mv = recommend_maneuver(worst, od.state_eci_km, od.covariance, od.epoch)
                run.maneuver = _maneuver_to_dict(mv)
                st.detail = f"Δv {mv.delta_v_m_s} m/s {mv.direction} @ {mv.burn_time.strftime('%H:%M:%SZ')}"
                st.elapsed_ms = (time.perf_counter() - t0) * 1000.0
                st.finished_at = datetime.now(timezone.utc).isoformat()
                st.status = "done"
                run.event("recommend", "warn",
                          f"Candidate maneuver: Δv {mv.delta_v_m_s} m/s along-track, "
                          f"awaiting operator approval.")
            run.state = "complete"
            return run

        except Exception as e:
            run.state = "failed"
            run.error = str(e)
            run.event("pipeline", "alarm", f"Pipeline error: {e}")
            return run

    def status(self) -> dict:
        with self._lock:
            return {
                "gps_meta": dict(self.gps_meta),
                "gps_loaded": len(self.gps_fixes),
                "catalog_meta": dict(self.catalog_meta),
                "catalog_loaded": len(self.catalog),
                "run": self.last_run.to_dict() if self.last_run else None,
            }
