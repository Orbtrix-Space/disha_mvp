"""
Constellation tasking optimizer.

Greedy, priority-aware, per-satellite non-overlapping. Plus a FIFO
baseline for the side-by-side comparison the spec calls for.

Rejection reasons:
    NO_ACCESS — no satellite has any access window for this target
    WEATHER   — every candidate pass exceeds cloud_max_pct
    CONFLICT  — every candidate pass collides with an already-scheduled task
    CAPACITY  — placeholder; not currently emitted (kept in API for parity)
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from typing import Iterable, List, Optional

from .access import AccessWindow, compute_access
from .constellation import SatelliteSpec
from .weather import cloud_cover_pct


# ─── Types ───────────────────────────────────────────────────────────

@dataclass
class ScheduledPass:
    request_id: str
    aoi_name: str
    sat_id: str
    start: datetime
    stop: datetime
    priority: int
    cloud_pct: float
    max_elevation_deg: float


@dataclass
class RejectedTarget:
    request_id: str
    aoi_name: str
    priority: int
    reason: str
    detail: str = ""


@dataclass
class ScheduleResult:
    scheduled: List[ScheduledPass] = field(default_factory=list)
    rejected: List[RejectedTarget] = field(default_factory=list)
    n_targets: int = 0
    horizon_start: Optional[datetime] = None
    horizon_stop: Optional[datetime] = None
    elapsed_ms: float = 0.0


# ─── Helpers ─────────────────────────────────────────────────────────

def _intersect(a_start, a_stop, b_start, b_stop):
    s = max(a_start, b_start)
    e = min(a_stop, b_stop)
    if e <= s:
        return None
    return s, e


def _pick_imaging_slot(window: AccessWindow, requested_start, requested_stop,
                       duration: timedelta):
    """Trim an access window to the requested window and fit `duration`."""
    overlap = _intersect(window.start, window.stop,
                         requested_start, requested_stop)
    if overlap is None:
        return None
    win_s, win_e = overlap
    if (win_e - win_s) < duration:
        return None
    # Schedule at the start of the trimmed window (earliest-feasible)
    return win_s, win_s + duration


def _overlaps_existing(scheduled: List[ScheduledPass], sat_id: str,
                       start: datetime, stop: datetime) -> bool:
    for p in scheduled:
        if p.sat_id != sat_id:
            continue
        if not (stop <= p.start or start >= p.stop):
            return True
    return False


# ─── Greedy scheduler ────────────────────────────────────────────────

def optimize(
    sats: List[SatelliteSpec],
    targets: List[dict],
    horizon_start: datetime,
    horizon_stop: datetime,
    fifo: bool = False,
    min_elevation_deg: float = 10.0,
) -> ScheduleResult:
    """
    Walk targets in priority order (or request-id order if `fifo=True`),
    and for each target try the earliest feasible access pass on any
    satellite. Skip passes whose mock cloud cover exceeds the target's
    cloud_max_pct. Skip passes that collide with already-scheduled work
    on that satellite. Emit a rejection reason if none of the candidate
    passes work.
    """
    import time as _t
    t0 = _t.perf_counter()

    if fifo:
        ordered = sorted(targets, key=lambda t: t["request_id"])
    else:
        # Priority 1 = highest, so ascending priority + tie-break by earliest
        # requested window beginning.
        ordered = sorted(targets, key=lambda t: (
            int(t["priority"]), t["start_time"],
        ))

    scheduled: List[ScheduledPass] = []
    rejected: List[RejectedTarget] = []

    for t in ordered:
        req_id = t["request_id"]
        aoi = t["aoi_name"]
        prio = int(t["priority"])
        req_s = t["start_time"]
        req_e = t["stop_time"]
        duration = timedelta(seconds=int(t["duration_sec"]))
        cloud_max = float(t["cloud_max_pct"])

        candidates: List[tuple[AccessWindow, tuple]] = []
        for sat in sats:
            for w in compute_access(sat, req_id, t["lat_deg"], t["lon_deg"],
                                    horizon_start, horizon_stop,
                                    min_elevation_deg=min_elevation_deg):
                slot = _pick_imaging_slot(w, req_s, req_e, duration)
                if slot is not None:
                    candidates.append((w, slot))

        if not candidates:
            rejected.append(RejectedTarget(req_id, aoi, prio,
                                           "NO_ACCESS",
                                           "No access window in horizon"))
            continue

        # Try earliest-first
        candidates.sort(key=lambda c: c[1][0])

        any_weather_blocked = False
        any_conflict_blocked = False
        placed = False
        for w, (slot_s, slot_e) in candidates:
            cloud = cloud_cover_pct(req_id, slot_s, aoi_seed=aoi)
            if cloud > cloud_max:
                any_weather_blocked = True
                continue
            if _overlaps_existing(scheduled, w.sat_id, slot_s, slot_e):
                any_conflict_blocked = True
                continue
            scheduled.append(ScheduledPass(
                request_id=req_id, aoi_name=aoi, sat_id=w.sat_id,
                start=slot_s, stop=slot_e, priority=prio,
                cloud_pct=cloud, max_elevation_deg=w.max_elevation_deg,
            ))
            placed = True
            break

        if not placed:
            if any_weather_blocked and not any_conflict_blocked:
                reason, detail = "WEATHER", f"Cloud > {cloud_max:.0f}%"
            elif any_conflict_blocked and not any_weather_blocked:
                reason, detail = "CONFLICT", "Passes collide with scheduled tasks"
            elif any_weather_blocked and any_conflict_blocked:
                reason, detail = "CONFLICT", "Weather + conflicts blocked all passes"
            else:
                reason, detail = "CAPACITY", "No feasible slot"
            rejected.append(RejectedTarget(req_id, aoi, prio, reason, detail))

    return ScheduleResult(
        scheduled=scheduled, rejected=rejected, n_targets=len(targets),
        horizon_start=horizon_start, horizon_stop=horizon_stop,
        elapsed_ms=(_t.perf_counter() - t0) * 1000.0,
    )


# ─── Analytics ───────────────────────────────────────────────────────

def analytics(result: ScheduleResult, sats: List[SatelliteSpec]) -> dict:
    """Roll the result into the KPIs the dashboard surfaces."""
    n = result.n_targets
    n_sch = len(result.scheduled)
    n_rej = len(result.rejected)
    horizon_sec = (result.horizon_stop - result.horizon_start).total_seconds() if result.horizon_start else 0
    used_sec = sum((p.stop - p.start).total_seconds() for p in result.scheduled)
    capacity_total_sec = horizon_sec * len(sats) if horizon_sec else 1
    cap_util = (used_sec / capacity_total_sec) * 100.0

    served_priorities = [p.priority for p in result.scheduled]
    avg_priority = (sum(served_priorities) / len(served_priorities)) if served_priorities else 0.0
    avg_cloud = (sum(p.cloud_pct for p in result.scheduled) / len(result.scheduled)) if result.scheduled else 0.0

    reasons: dict = {"WEATHER": 0, "CONFLICT": 0, "NO_ACCESS": 0, "CAPACITY": 0}
    for r in result.rejected:
        reasons[r.reason] = reasons.get(r.reason, 0) + 1

    by_sat: dict = {s.sat_id: 0 for s in sats}
    for p in result.scheduled:
        by_sat[p.sat_id] = by_sat.get(p.sat_id, 0) + 1

    prio_counts: dict = {}
    for p in result.scheduled:
        prio_counts[p.priority] = prio_counts.get(p.priority, 0) + 1

    return {
        "n_targets": n,
        "n_scheduled": n_sch,
        "n_rejected": n_rej,
        "yield_pct": round((n_sch / n) * 100.0, 1) if n else 0.0,
        "capacity_utilization_pct": round(cap_util, 1),
        "avg_priority_served": round(avg_priority, 2),
        "avg_cloud_pct": round(avg_cloud, 1),
        "rejection_reasons": reasons,
        "by_satellite": by_sat,
        "by_priority": prio_counts,
        "elapsed_ms": round(result.elapsed_ms, 1),
    }
