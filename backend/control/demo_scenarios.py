"""
DISHA Beta — Demo Scenario Injector

Live-demo control surface for triggering preset anomalies on stage.
Each scenario is a slow drift designed to be caught by the AI monitor
well before the rule-based FDIR thresholds fire — this is the
load-bearing claim of the demo.

Architecture:
- The injector is an OVERLAY on top of the simulator. It does not
  touch MissionState's underlying physics. Instead, the tick loop
  calls `injector.apply(telemetry_dict)` AFTER `satellite.get_state()`
  and BEFORE FDIR / AI evaluation. The injector mutates the dict.
- On cancel, the injector ramps the delta down to zero and the
  next telemetry dict is back to nominal — no orbit reset needed.
- Scenarios are pure functions: (telemetry, elapsed_sec, intensity)
  -> dict of field deltas. Easy to add, easy to tune, no hidden state.

Calibrated drift rates and expected timings live next to each scenario
function. See demo_scenarios_calibration.md for the formal log.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional


# ─── Types ────────────────────────────────────────────────────────────

@dataclass
class ScenarioSpec:
    id: str
    name: str                       # short label
    description: str                # investor-facing single paragraph
    expected_ai_catch_sec: float    # AI anomaly_score >= 0.4
    expected_rule_catch_sec: float  # first rule alert
    expected_autonomy_react_sec: float  # autonomy mode change
    ramp_seconds: float = 30.0      # ramp-up window
    recovery_seconds: float = 30.0  # ramp-down window on cancel
    fields_affected: List[str] = field(default_factory=list)
    apply_fn: Optional[Callable] = None  # (state, t_sec, intensity) -> dict[str, float]


@dataclass
class ScenarioRun:
    run_id: str
    scenario_id: str
    started_at: str
    elapsed_sec: float = 0.0
    intensity: float = 1.0
    state: str = "active"          # active | recovering | complete
    cancel_at_elapsed: Optional[float] = None
    triggered_events: Dict[str, Optional[float]] = field(default_factory=lambda: {
        "ai_catch_sec": None,        # when anomaly_score first >= 0.4
        "ai_critical_sec": None,     # when anomaly_score first >= 0.7
        "rule_catch_sec": None,      # when any new rule alert fires
        "autonomy_react_sec": None,  # when autonomy mode first changes
        "completed_sec": None,
    })

    def as_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "scenario_id": self.scenario_id,
            "started_at": self.started_at,
            "elapsed_sec": round(self.elapsed_sec, 2),
            "intensity": self.intensity,
            "state": self.state,
            "cancel_at_elapsed": self.cancel_at_elapsed,
            "triggered_events": dict(self.triggered_events),
        }


# ─── Scenario 1: Thermal drift ────────────────────────────────────────
# Tuned: 2026-05-17
# Drift: battery_temp += 0.05 °C / sec, no other deltas.
# Rationale: starting from 22 °C nominal, threshold TEMP_BATT_HIGH=45 °C
# means the rule fires at (45-22)/0.05 ≈ 460 s ≈ 7m40s.
# The AI catches the drift very early — battery_temp training std was
# ~0.1 °C, so a 0.5 °C offset (10 s of drift past ramp) already pushes
# the per-feature reconstruction z-score above the 2.5 flag threshold.
# Anomaly_score crosses 0.4 (warning band) roughly 60 s into the
# scenario once the rolling buffer has absorbed enough drifted samples.
def _thermal_drift(state: dict, t: float, intensity: float) -> Dict[str, float]:
    drift = 0.05 * t * intensity  # °C cumulative
    return {
        "battery_temp": drift,
        "battery_temp_c": drift,
    }


# ─── Scenario 2: Battery capacity degradation ─────────────────────────
# Tuned: 2026-05-17
# Drift: SOC -0.1 % / sec additional drain.
# Rationale: at nominal load the simulator drains at ~0.0002 %/s, so
# a 0.1 %/s extra drop is 500x the nominal rate — the model sees a
# slope it never trained on, even though absolute SOC stays inside
# nominal bounds for several minutes. Starting from ~70 % SOC the
# rule BATT_LOW (<40 %) fires at (70-40)/0.1 = 300 s = 5 min, and
# BATT_CRITICAL (<20 %) at 500 s if the operator does nothing.
# AI catches by ~60 s — the joint distribution of (solar_input_power,
# battery_soc) is broken: solar input may be positive while SOC keeps
# falling, which never happens in training.
def _battery_degradation(state: dict, t: float, intensity: float) -> Dict[str, float]:
    drop_pct = -0.1 * t * intensity  # cumulative negative offset
    return {
        "battery_soc": drop_pct,
        "battery_pct": drop_pct,
        # Reflect the apparent extra drain on the watt-hour reading too,
        # so the frontend's energy gauge tells the same story.
        "battery_wh": drop_pct * 5.0,  # 500 Wh capacity / 100 % = 5 Wh/%
    }


# ─── Scenario 3: Pointing + SNR correlated drift ──────────────────────
# Tuned: 2026-05-17
# Drift: pointing_error +0.1° / minute, snr -0.5 dB / minute, applied
# only while in_contact so we don't fight the simulator's blackout-zero.
# Rationale: pointing rule POINTING_ERROR(>2°) fires at (2.0-0.1)/(0.1/60)
# = 1140 s ≈ 19 min — outside any reasonable demo window. SNR rule
# SNR_LOW(<8) fires when baseline ~14 dB drops 6 dB → (6)/(0.5/60) =
# 720 s = 12 min. Both rule thresholds stay quiet for the entire demo.
# The AI flags ADCS within ~60 s because the pointing trajectory
# (monotonic ramp) is structurally unlike the noise it trained on.
# COMMS flags follow ~3 min later as SNR falls below its calibrated
# z-band, surfacing the JOINT drift to the operator before the rules
# would see anything wrong.
def _pointing_snr_correlation(state: dict, t: float, intensity: float) -> Dict[str, float]:
    pointing_drift = (0.1 / 60.0) * t * intensity   # °/sec
    # Apply the SNR drop only when the spacecraft is actually in contact;
    # otherwise SNR is already 0 from the comms blackout model and the
    # delta would not be visible.
    in_contact = bool(state.get("in_contact", False))
    snr_drift = -(0.5 / 60.0) * t * intensity if in_contact else 0.0
    return {
        "pointing_error": pointing_drift,
        "snr": snr_drift,
        "snr_db": snr_drift,
    }


# ─── Registry ─────────────────────────────────────────────────────────

SCENARIOS: Dict[str, ScenarioSpec] = {
    "thermal_drift": ScenarioSpec(
        id="thermal_drift",
        name="Thermal Drift",
        description=(
            "Battery temperature is slowly rising. It will stay inside "
            "the rule threshold for nearly eight minutes. The AI sees "
            "the rate of change diverge from the panel temperature "
            "baseline and flags it within the first minute."
        ),
        expected_ai_catch_sec=60.0,
        expected_rule_catch_sec=460.0,
        expected_autonomy_react_sec=90.0,
        ramp_seconds=30.0,
        recovery_seconds=30.0,
        fields_affected=["battery_temp"],
        apply_fn=_thermal_drift,
    ),
    "battery_degradation": ScenarioSpec(
        id="battery_degradation",
        name="Battery Capacity Degradation",
        description=(
            "Battery state-of-charge is dropping faster than the load "
            "profile predicts. The absolute SOC stays above the warning "
            "threshold for five minutes. The AI catches it because the "
            "relationship between current draw, solar input, and SOC "
            "has shifted from the training distribution."
        ),
        expected_ai_catch_sec=60.0,
        expected_rule_catch_sec=300.0,
        expected_autonomy_react_sec=90.0,
        ramp_seconds=30.0,
        recovery_seconds=45.0,
        fields_affected=["battery_soc", "battery_pct", "battery_wh"],
        apply_fn=_battery_degradation,
    ),
    "pointing_snr_correlation": ScenarioSpec(
        id="pointing_snr_correlation",
        name="Pointing and SNR Drift",
        description=(
            "Pointing error is climbing while SNR is falling, both well "
            "inside their rule thresholds. The AI catches the correlation "
            "immediately because the joint distribution is what it learned "
            "in training, not the marginal numbers."
        ),
        expected_ai_catch_sec=75.0,
        expected_rule_catch_sec=720.0,   # SNR_LOW; pointing rule doesn't fire in demo window
        expected_autonomy_react_sec=120.0,
        ramp_seconds=30.0,
        recovery_seconds=30.0,
        fields_affected=["pointing_error", "snr"],
        apply_fn=_pointing_snr_correlation,
    ),
}


def get_scenario(scenario_id: str) -> ScenarioSpec:
    if scenario_id not in SCENARIOS:
        raise KeyError(f"Unknown scenario: {scenario_id}")
    return SCENARIOS[scenario_id]


def expected_timeline(scenario_id: str) -> dict:
    """Operator-facing timeline of when AI / rules / autonomy SHOULD react."""
    spec = get_scenario(scenario_id)
    return {
        "scenario_id": scenario_id,
        "name": spec.name,
        "description": spec.description,
        "ramp_seconds": spec.ramp_seconds,
        "recovery_seconds": spec.recovery_seconds,
        "expected_ai_catch_sec": spec.expected_ai_catch_sec,
        "expected_rule_catch_sec": spec.expected_rule_catch_sec,
        "expected_autonomy_react_sec": spec.expected_autonomy_react_sec,
        "fields_affected": list(spec.fields_affected),
    }


def list_scenarios() -> List[dict]:
    return [expected_timeline(sid) for sid in SCENARIOS]


# ─── Injector ─────────────────────────────────────────────────────────

class DemoScenarioInjector:
    """
    Overlay on top of MissionState. Holds the active scenario runs,
    applies their deltas to the telemetry dict produced by the simulator,
    and exposes a small API that the tick loop and /demo endpoints use.

    No state of the simulator is mutated. The injector keeps physics
    clean so recovery is just "stop applying deltas".
    """

    def __init__(self):
        self.runs: Dict[str, ScenarioRun] = {}
        # Bounded history of completed runs — useful for the panel
        # to show the summary after a scenario ends.
        self.completed: List[ScenarioRun] = []
        self._completed_max = 16

    # ─── Trigger / cancel / reset ──────────────────────────────────

    def trigger(self, scenario_id: str, intensity: float = 1.0) -> ScenarioRun:
        spec = get_scenario(scenario_id)
        # Only one active run per scenario id — relaunch replaces.
        for r in list(self.runs.values()):
            if r.scenario_id == scenario_id and r.state != "complete":
                self.cancel(r.run_id, immediate=True)

        intensity = max(0.0, min(1.0, float(intensity)))
        run = ScenarioRun(
            run_id=uuid.uuid4().hex[:8],
            scenario_id=scenario_id,
            started_at=datetime.now(timezone.utc).isoformat(),
            intensity=intensity,
        )
        self.runs[run.run_id] = run
        return run

    def cancel(self, run_id: str, immediate: bool = False) -> Optional[ScenarioRun]:
        run = self.runs.get(run_id)
        if not run:
            return None
        if run.state == "active":
            if immediate:
                run.state = "complete"
                run.triggered_events["completed_sec"] = run.elapsed_sec
                self._archive(run)
            else:
                run.state = "recovering"
                run.cancel_at_elapsed = run.elapsed_sec
        return run

    def reset_all(self) -> int:
        """Cancel everything immediately and clear in-memory state."""
        n = len(self.runs)
        for r in self.runs.values():
            r.state = "complete"
            r.triggered_events["completed_sec"] = r.elapsed_sec
        self.completed.clear()
        self.runs.clear()
        return n

    def _archive(self, run: ScenarioRun):
        self.completed.append(run)
        if len(self.completed) > self._completed_max:
            self.completed.pop(0)

    # ─── Tick integration ──────────────────────────────────────────

    def step(self, dt: float = 1.0):
        """Advance elapsed timers and finalize recovering scenarios."""
        for run in list(self.runs.values()):
            if run.state == "complete":
                continue
            run.elapsed_sec += dt
            spec = get_scenario(run.scenario_id)
            if run.state == "recovering":
                recovery_elapsed = run.elapsed_sec - (run.cancel_at_elapsed or 0.0)
                if recovery_elapsed >= spec.recovery_seconds:
                    run.state = "complete"
                    run.triggered_events["completed_sec"] = run.elapsed_sec

        # Move completed runs out of the active map after this tick
        for rid in [r.run_id for r in self.runs.values() if r.state == "complete"]:
            run = self.runs.pop(rid)
            self._archive(run)

    def apply(self, telemetry: dict) -> dict:
        """
        Apply all active scenario deltas to the telemetry dict.
        Mutates and returns the same dict for chaining.
        """
        for run in self.runs.values():
            if run.state == "complete":
                continue
            spec = get_scenario(run.scenario_id)

            # Effective intensity — ramp up / hold / ramp down on cancel
            if run.state == "active":
                if run.elapsed_sec < spec.ramp_seconds and spec.ramp_seconds > 0:
                    eff = run.intensity * (run.elapsed_sec / spec.ramp_seconds)
                else:
                    eff = run.intensity
            elif run.state == "recovering":
                rec = max(0.0, run.elapsed_sec - (run.cancel_at_elapsed or 0.0))
                if spec.recovery_seconds > 0:
                    eff = run.intensity * max(0.0, 1.0 - rec / spec.recovery_seconds)
                else:
                    eff = 0.0
            else:
                eff = 0.0

            if eff <= 0.0 or spec.apply_fn is None:
                continue

            deltas = spec.apply_fn(telemetry, run.elapsed_sec, eff)
            for key, delta in deltas.items():
                if delta is None:
                    continue
                if key in telemetry and telemetry[key] is not None:
                    try:
                        telemetry[key] = float(telemetry[key]) + float(delta)
                    except (TypeError, ValueError):
                        telemetry[key] = float(delta)
                else:
                    telemetry[key] = float(delta)
        return telemetry

    def record_observation(
        self,
        anomaly_score: float,
        new_rule_alert_ids: List[str],
        autonomy_mode_changed: bool,
    ):
        """
        Tick-loop callback: stamps the first time the AI flagged, the
        first time rules fired, and the first time autonomy reacted on
        each active run. Used for the demo panel's live summary.
        """
        for run in self.runs.values():
            if run.state == "complete":
                continue
            ev = run.triggered_events
            if ev["ai_catch_sec"] is None and anomaly_score >= 0.4:
                ev["ai_catch_sec"] = round(run.elapsed_sec, 1)
            if ev["ai_critical_sec"] is None and anomaly_score >= 0.7:
                ev["ai_critical_sec"] = round(run.elapsed_sec, 1)
            if ev["rule_catch_sec"] is None and new_rule_alert_ids:
                # Only stamp on alerts triggered after scenario start
                # (FDIR is self-clearing so anything currently new counts)
                ev["rule_catch_sec"] = round(run.elapsed_sec, 1)
            if ev["autonomy_react_sec"] is None and autonomy_mode_changed:
                ev["autonomy_react_sec"] = round(run.elapsed_sec, 1)

    # ─── Read API ──────────────────────────────────────────────────

    def active_scenarios(self) -> List[dict]:
        return [r.as_dict() for r in self.runs.values()]

    def recent_completed(self) -> List[dict]:
        return [r.as_dict() for r in self.completed][-self._completed_max:]

    def status(self) -> dict:
        return {
            "active_count": sum(1 for r in self.runs.values() if r.state != "complete"),
            "active": self.active_scenarios(),
            "recent_completed": self.recent_completed(),
        }
