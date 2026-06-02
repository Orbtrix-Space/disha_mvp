"""
DISHA Beta — Demo Scenario Calibration Harness

Drives the same engines the live tick loop uses (MissionState, FDIR,
AIMonitor, AutonomyManager, DemoScenarioInjector), in a tight headless
loop, to measure how long each demo scenario takes to be:
  - caught by the AI       (anomaly_score >= 0.4)
  - caught by rules        (any new FDIR alert from an affected field)
  - reacted to by autonomy (mode change away from AUTONOMOUS)
  - recovered              (anomaly_score back below 0.2 after cancel)

Runs each scenario 5 times. Prints a one-line summary per scenario at
the end and writes the full table to demo_scenarios_calibration.md.

If a scenario consistently fails the AI-before-rules ordering, raise
the drift rate in demo_scenarios.py — do not lower the AI threshold.
"""

from __future__ import annotations

import statistics
import sys
import time
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.shared.models.config import load_config  # noqa: E402

load_config()

from backend.shared.state.mission_state import MissionState  # noqa: E402
from backend.fdir.engine import FDIREngine  # noqa: E402
from backend.fdir.ai_monitor import AIMonitor  # noqa: E402
from backend.shared.constraints import evaluate_constraints  # noqa: E402
from backend.control.autonomy import AutonomyManager  # noqa: E402
from backend.control.demo_scenarios import (  # noqa: E402
    DemoScenarioInjector, SCENARIOS, get_scenario,
)


WARM_TICKS = 90            # let AI buffer fill + autonomy settle
MAX_RUN_TICKS = 800        # ~13 min: give rules enough time to fire
POST_CANCEL_TICKS = 180    # 3 min recovery window


def _force_contact_telemetry(state: dict):
    """Override the simulator's blackout SNR so scenario 3 has a chance
    to drift inside a stable comms baseline. Real demo runs use real
    contact predictions; the calibration harness forces contact so the
    test is reproducible regardless of orbit phase."""
    state["in_contact"] = True
    state["link_status"] = "NOMINAL"
    if state.get("snr", 0) < 5:
        state["snr"] = 14.0
        state["snr_db"] = 14.0


def simulate_run(scenario_id: str) -> dict:
    """
    Run one calibration trial. Returns a dict with measured times for
    AI catch, rule catch, autonomy reaction, and post-cancel recovery.
    """
    sat = MissionState()
    fdir = FDIREngine()
    ai = AIMonitor()
    auto = AutonomyManager()
    inj = DemoScenarioInjector()

    # Warm-up: get a baseline so the AI buffer is full and autonomy
    # has settled into AUTONOMOUS before scenario starts.
    prev_alert_ids: set[str] = set()
    for _ in range(WARM_TICKS):
        sat.tick(1.0)
        state = sat.get_state()
        _force_contact_telemetry(state)
        ai.update(state)
        ai.evaluate()
        fdir.evaluate(state)

    # Force consistent starting SOC for scenario 2; otherwise nominal.
    if scenario_id == "battery_degradation":
        sat.current_battery_wh = sat.battery_capacity_wh * 0.70

    # Trigger the scenario
    run = inj.trigger(scenario_id, intensity=1.0)
    spec = get_scenario(scenario_id)

    ai_catch_t: Optional[float] = None
    rule_catch_t: Optional[float] = None
    autonomy_react_t: Optional[float] = None
    cancel_t: Optional[float] = None
    recovery_t: Optional[float] = None
    prev_mode = auto.mode

    # Active drift loop — runs until rules catch (and autonomy reacts
    # at least once) or we hit max ticks.
    elapsed = 0.0
    for _ in range(MAX_RUN_TICKS):
        sat.tick(1.0)
        state = sat.get_state()
        _force_contact_telemetry(state)
        inj.step(1.0)
        state = inj.apply(state)

        alerts = fdir.evaluate(state)
        current_alert_ids = {a.get("rule_id") for a in alerts}
        new_alerts = current_alert_ids - prev_alert_ids
        prev_alert_ids = current_alert_ids

        ai.update(state)
        result = ai.evaluate()
        constraints = evaluate_constraints(state)
        ai_dict = result.model_dump()
        ai_dict["confidence"] = ai_dict.get("model_confidence", "unavailable")
        ai_dict["flagged_subsystems"] = [
            fs["subsystem"] for fs in ai_dict.get("flagged_subsystems", [])
        ]
        auto.evaluate(state, constraints, ai_result=ai_dict)

        elapsed = run.elapsed_sec  # injector.step bumped this

        if ai_catch_t is None and result.anomaly_score >= 0.4:
            ai_catch_t = elapsed
        if rule_catch_t is None and new_alerts:
            # Only stamp if the new alert is on a field this scenario
            # actually drives, to avoid background rules firing first.
            scenario_fields = set(spec.fields_affected)
            field_to_rule = {
                "battery_temp": {"TEMP_BATT_HIGH", "TEMP_BATT_LOW"},
                "battery_soc":  {"BATT_LOW", "BATT_CRITICAL"},
                "battery_pct":  {"BATT_LOW", "BATT_CRITICAL"},
                "pointing_error": {"POINTING_ERROR"},
                "snr": {"SNR_LOW", "SNR_CRITICAL"},
            }
            relevant_rules = set()
            for f in scenario_fields:
                relevant_rules |= field_to_rule.get(f, set())
            if new_alerts & relevant_rules:
                rule_catch_t = elapsed
        if autonomy_react_t is None and auto.mode != prev_mode:
            autonomy_react_t = elapsed
        prev_mode = auto.mode

        # End condition: stop once rules have fired AND autonomy has
        # reacted (or after MAX_RUN_TICKS regardless).
        if rule_catch_t is not None and autonomy_react_t is not None:
            cancel_t = elapsed
            break

    if cancel_t is None:
        cancel_t = elapsed

    # Cancel and watch recovery (anomaly_score drifts back below 0.2)
    inj.cancel(run.run_id)
    for _ in range(POST_CANCEL_TICKS):
        sat.tick(1.0)
        state = sat.get_state()
        _force_contact_telemetry(state)
        inj.step(1.0)
        state = inj.apply(state)
        fdir.evaluate(state)
        ai.update(state)
        result = ai.evaluate()
        constraints = evaluate_constraints(state)
        ai_dict = result.model_dump()
        ai_dict["confidence"] = ai_dict.get("model_confidence", "unavailable")
        ai_dict["flagged_subsystems"] = [
            fs["subsystem"] for fs in ai_dict.get("flagged_subsystems", [])
        ]
        auto.evaluate(state, constraints, ai_result=ai_dict)

        if result.anomaly_score <= 0.2:
            recovery_t = run.elapsed_sec - cancel_t
            break

    return {
        "scenario_id": scenario_id,
        "ai_catch_sec": ai_catch_t,
        "rule_catch_sec": rule_catch_t,
        "autonomy_react_sec": autonomy_react_t,
        "cancel_at_sec": cancel_t,
        "recovery_sec": recovery_t,
        "ai_before_rules": (
            ai_catch_t is not None
            and rule_catch_t is not None
            and ai_catch_t < rule_catch_t
        ),
    }


def median_or_none(values):
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return statistics.median(clean)


def main():
    print(f"\nCalibrating {len(SCENARIOS)} scenarios x 5 trials each\n")
    all_results: dict[str, list[dict]] = {}
    for sid in SCENARIOS:
        spec = get_scenario(sid)
        print(f"=== {sid} === expected AI<{spec.expected_ai_catch_sec}s "
              f"rules @ {spec.expected_rule_catch_sec}s")
        runs = []
        for i in range(5):
            t0 = time.perf_counter()
            r = simulate_run(sid)
            wall = time.perf_counter() - t0
            print(f"  run {i+1}/5  ai={r['ai_catch_sec']}  "
                  f"rule={r['rule_catch_sec']}  "
                  f"auto={r['autonomy_react_sec']}  "
                  f"recov={r['recovery_sec']}  "
                  f"AI<rules={r['ai_before_rules']}  "
                  f"wall={wall:.1f}s")
            runs.append(r)
        all_results[sid] = runs

    # One-line summary per scenario
    print("\n--- CALIBRATION SUMMARY (medians over 5 runs) ---")
    summary_lines = []
    for sid, runs in all_results.items():
        ai_med = median_or_none([r["ai_catch_sec"] for r in runs])
        rule_med = median_or_none([r["rule_catch_sec"] for r in runs])
        auto_med = median_or_none([r["autonomy_react_sec"] for r in runs])
        recov_med = median_or_none([r["recovery_sec"] for r in runs])
        ai_wins = sum(1 for r in runs if r["ai_before_rules"])
        line = (
            f"{sid:<32} "
            f"ai_catch_median={ai_med}s  "
            f"rule_catch_median={rule_med}s  "
            f"autonomy_react={auto_med}s  "
            f"recovery={recov_med}s  "
            f"AI_before_rules={ai_wins}/5"
        )
        summary_lines.append(line)
        print(line)

    # Write markdown calibration log
    log_path = ROOT / "backend" / "core" / "demo_scenarios_calibration.md"
    write_calibration_log(log_path, all_results)
    print(f"\nWrote {log_path}")


def write_calibration_log(path: Path, results: dict[str, list[dict]]):
    from datetime import datetime
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    with open(path, "w", encoding="utf-8") as f:
        f.write("# DISHA — Demo Scenario Calibration Log\n\n")
        f.write(f"Generated: {now}  \n")
        f.write("Source: `backend/scripts/calibrate_demo_scenarios.py`  \n")
        f.write("Reruns: run that script to refresh after any change to "
                "`demo_scenarios.py`, `mission_state.py`, or the AI weights.\n\n")
        f.write("Each row is the median over 5 independent simulated runs. "
                "`ai_catch_sec` is when `anomaly_score` first reached 0.4. "
                "`rule_catch_sec` is when the first FDIR alert fired on a "
                "field the scenario actually drives. `autonomy_react_sec` "
                "is when autonomy first changed mode. `recovery_sec` is "
                "how long after cancel `anomaly_score` returned below 0.2.\n\n")

        for sid, runs in results.items():
            spec = get_scenario(sid)
            f.write(f"## `{sid}` — {spec.name}\n\n")
            f.write(f"_{spec.description}_\n\n")
            f.write(
                f"**Expected (from spec):** AI flags ≤ "
                f"{spec.expected_ai_catch_sec}s · rules fire ≥ "
                f"{spec.expected_rule_catch_sec}s · autonomy reacts ≤ "
                f"{spec.expected_autonomy_react_sec}s · ramp "
                f"{spec.ramp_seconds}s / recovery {spec.recovery_seconds}s.\n\n"
            )
            f.write(f"**Fields affected:** {', '.join(spec.fields_affected)}\n\n")
            f.write("| run | ai_catch_sec | rule_catch_sec | "
                    "autonomy_react_sec | cancel_at_sec | recovery_sec | "
                    "AI<rules |\n")
            f.write("|----:|-------------:|---------------:|--------------:|"
                    "-------------:|-------------:|:--------|\n")
            for i, r in enumerate(runs, 1):
                f.write(
                    f"| {i} | {r['ai_catch_sec']} | {r['rule_catch_sec']} | "
                    f"{r['autonomy_react_sec']} | {r['cancel_at_sec']} | "
                    f"{r['recovery_sec']} | "
                    f"{'YES' if r['ai_before_rules'] else 'NO'} |\n"
                )
            ai_med = median_or_none([r["ai_catch_sec"] for r in runs])
            rule_med = median_or_none([r["rule_catch_sec"] for r in runs])
            auto_med = median_or_none([r["autonomy_react_sec"] for r in runs])
            recov_med = median_or_none([r["recovery_sec"] for r in runs])
            ai_wins = sum(1 for r in runs if r["ai_before_rules"])
            f.write(
                f"\n**Medians:** ai_catch={ai_med}s · rule_catch={rule_med}s "
                f"· autonomy_react={auto_med}s · recovery={recov_med}s · "
                f"AI_before_rules **{ai_wins}/5**.\n\n"
            )


if __name__ == "__main__":
    main()
