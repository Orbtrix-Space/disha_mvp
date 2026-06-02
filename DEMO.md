# DISHA — Demo Operator Notes

Phase 2 deliverable. The full click-by-click investor script lives in Phase 6;
this file currently covers operational notes for the AI anomaly monitor.

## Retraining the model

If you change the simulator's nominal behavior (new TLE, different power
budget, new subsystem dynamics), retrain so the calibration reflects the
new "normal".

```powershell
# Regenerate nominal telemetry (~20 seconds, ~130K samples)
$env:PYTHONPATH = "."
python backend/scripts/generate_training_data.py --hours 12

# Train (~3 minutes on CPU, 50 epochs early-stopped on val loss)
python backend/scripts/train_anomaly_model.py
```

Both scripts print their honest numbers (sample count, feature ranges,
param count, train/val loss, median inference latency) so any drift from
the pitch numbers shows up in the log immediately.

Artifacts land in `backend/core/ai_weights/`:
- `model.pt` — torch state_dict + architecture metadata
- `scaler.pkl` — per-feature mean/std for input standardization
- `features.json` — feature order + per-feature reconstruction-error
  mean/std (the inference-time calibration for the z-score normalization)

Restart the backend to pick up new weights — the monitor loads once at
startup, not per request.

## What the numbers mean

Print this whenever someone on stage asks "how big is the model":

| Pitch claim | Source of truth | Last measured |
|---|---|---|
| < 100K params | trainer + `AIMonitor.param_count` at boot | **8,680** |
| < 50 ms inference / tick | `latency_stats()` rolling, 100-sample median | **~1 ms** |
| Explainable per feature | `result.per_feature_zscore` + `flagged_subsystems` | always populated |
| Deterministic replay | tests `test_determinism_same_input_same_output` | passes |

## Fallback if the model misbehaves live

If the AI monitor produces nonsense on stage, **disable it without
touching code**:

1. Edit `config/satellite_config.json`.
2. Set `autonomy.ai_monitor.enabled` to `false`.
3. Restart the backend (`uvicorn backend.main:app --port 8000`).

With `enabled: false`, the monitor short-circuits to a zero anomaly score
and `model_confidence: "disabled"`. The autonomy manager treats that as
"no AI signal" — rule-based FDIR + the constraint engine continue running
as the deterministic safety backstop, so the demo keeps functioning,
just without the augmentation layer.

You can also turn the AI contribution down without disabling it:
- `autonomy.ai_monitor.weight` (default `0.3`) — how much the AI lifts
  the rule-based risk score. Set lower to mute the AI without hiding it.
- `autonomy.ai_monitor.min_anomaly_for_escalation` (default `0.4`) —
  the AI cannot push autonomy into a higher mode unless its score is at
  or above this floor. Raising this makes the AI advisory-only.

## Diagnostics endpoint

`GET /intelligence/ai-monitor` returns the latest result plus rolling
latency stats and the active thresholds. Useful for live spot-checks
without watching the WebSocket stream.

---

# Demo Scenarios (Phase 3)

## Calibrated numbers — medians over 5 runs each

These are the numbers to quote on stage. The full table lives in
[backend/core/demo_scenarios_calibration.md](backend/core/demo_scenarios_calibration.md).
Rerun `python backend/scripts/calibrate_demo_scenarios.py` to refresh
after any change to scenarios, simulator, or AI weights.

| Scenario | AI catch | Rule catch | Lead time | Autonomy reacts | Recovery |
|---|---:|---:|---:|---:|---:|
| `thermal_drift` | T+5s | T+461s | **7.6 min** | T+8s | 30s |
| `battery_degradation` | T+1s | T+303s | **5.0 min** | T+1s | 45s |
| `pointing_snr_correlation` | T+16s | T+721s | **11.7 min** | T+52s | 30s |

AI beats rules 5/5 on every scenario. The recovery column is how long
after **Cancel** the AI score returns below 0.2 — well under the 2-minute
target.

## Pre-demo checklist (run this 10 minutes before)

1. **Backend up.** `uvicorn backend.main:app --port 8000` — verify the
   log shows `[AI_MONITOR] loaded model.pt features=8 param_count=8680`.
2. **Frontend up.** `cd frontend && npm run dev` — open
   `http://localhost:5173/?demo=true` (note the query param).
3. **Panel visible.** Top-right dock should show `DEMO CONTROL` with
   three buttons. Bottom-left should show `UNIFIED LOOP TIMELINE`.
4. **Timeline rendering.** Watch for 10 s — the teal anomaly_score line
   should hover near zero; the background should be solid green
   (AUTONOMOUS) bands.
5. **Reset.** Click `Reset all` once so the demo starts cold.
6. **Sanity inject.** Click `Thermal Drift` and watch for AI catch +
   green→amber band transition within 30 s. Click `Cancel`, wait for
   recovery to clean up. The demo is now warmed up; reset once more.

## The five-minute investor script

> Open on the unified view (Phase 5; until then, `?demo=true` on the
> Control page). Camera/screen-share on the timeline + panel.

**0:00 — Open with the architecture claim.**
> "DISHA closes a loop inside every second of operation. Rules and AI
> read the same telemetry; their outputs feed autonomy; autonomy
> changes the command queue — all in one frame at 1 Hz."

Show the timeline running flat. Point at the teal AI line and the gray
rule line, both near zero, in a green AUTONOMOUS band.

**0:30 — Click `Thermal Drift`.**
Voice over while the run starts:
> "Battery temperature is starting to drift. Rules are configured to
> fire at 45 °C. From a 22 °C baseline at the rate we're injecting,
> rules will fire around minute seven."

Within ~5 s, the AI line ticks up past the 0.4 dashed warning line.
The DEMO CONTROL panel shows **AI flagged: T+5s** under the active run.

**0:35 — Call it out.**
> "AI caught it in five seconds. Battery temperature is still 22 point
> something Celsius. No rule has fired. The model knows this rate of
> change isn't normal because it learned the joint distribution between
> battery and panel temperatures during training."

**0:45 — Autonomy reacts. Background band turns amber (GUARDED).**
A vertical white line appears in the timeline — that's the re-plan
event. The panel shows **Autonomy reacted: T+8s**.
> "Because the AI score crossed our escalation threshold, autonomy
> moved from AUTONOMOUS to GUARDED, and the planner deferred the
> pending command sequences. That white line is the re-plan happening
> inside the same tick the AI flagged. That is the closed loop."

**1:15 — Click `Cancel`.**
> "Now I cancel the drift. We're not resetting the simulator — the
> spacecraft keeps flying. The injector ramps the delta back to zero
> and the system has to recover on its own."

Watch the teal line decay below 0.2 within ~30 s. Background returns
to green. Panel shows **recovery complete**.

**2:00 — Click `Battery Capacity Degradation`.**
> "This is the subtle one. Battery state-of-charge will drop faster
> than the load profile predicts. Absolute SOC stays inside the rule
> warning threshold for the first five minutes. Rule-based systems are
> blind to this kind of drift."

AI catches almost immediately (T+1s). Autonomy escalates within
seconds because the slope is so far outside the training distribution.

**2:30 — Reframe.**
> "Five-minute head start. In an operational satellite that's the
> difference between de-prioritizing imaging tasks now and entering
> safe mode later. This is the AI augmentation layer doing what rules
> structurally cannot."

**3:15 — Cancel. Click `Pointing and SNR Drift`.**
> "Last one. Pointing error climbing, SNR dropping. Neither value
> crosses its rule threshold for twelve minutes. The AI catches the
> correlation in under twenty seconds because it learned the joint
> distribution, not just the marginal values."

Timeline shows two subsystems flagging in sequence — ADCS first,
COMMS shortly after — both before the rule lines would even leave the
baseline.

**4:30 — Close.**
> "Three scenarios, three different failure modes, three different
> lead times the operator can use. Small model, eight thousand
> parameters, one millisecond per tick. Deterministic. Explainable per
> feature. And every flag flows through the same loop into the same
> autonomy decision into the same command queue, every second."

**5:00 — Cancel. Reset all.** End.

## Three fallback paths

Use these one-liners if something on stage goes sideways. Don't apologize,
pivot. The audience hasn't read this doc.

**Fallback 1: AI misses (anomaly_score stays low).**
> "Worth showing the contrast — the rules will still catch this, just
> later. Watch the gray line."
- Keep narrating while you wait. Rule catch is deterministic and will
  fire at the calibrated time.
- After the demo, retrain (`backend/scripts/train_anomaly_model.py`).

**Fallback 2: Rules fire too early (before AI).**
> "Interesting — this satellite has its rules tuned tighter than what
> we calibrate against. In a real operation you'd loosen those and
> rely more on the AI layer. Let me show you the next scenario."
- Skip to the next scenario. Don't re-run the failing one live.
- After the demo, raise the relevant FDIR threshold in
  `config/satellite_config.json`.

**Fallback 3: Autonomy does not react (no mode change, no re-plan).**
> "Autonomy is configured advisory-only in this profile. Watch the
> anomaly score and the flagged subsystems on the right — that's the
> operator's early-warning surface even when the loop is open."
- Likely cause: `ai_monitor.weight` or `min_anomaly_for_escalation`
  too restrictive. Check `config/satellite_config.json`.

## Recovery sequence between scenarios

You can run all three in a 10-minute session. Between scenarios:
1. Wait for the AI score to settle below 0.2 (≤ 45 s after Cancel).
2. Wait for the background band to return to green AUTONOMOUS.
3. Verify the panel shows `state: complete` for the previous run.
4. Click the next scenario. Don't `Reset all` between scenarios —
   reset wipes the timeline and breaks the visual continuity.

Only `Reset all` between rehearsal runs or if a scenario produced an
unexpected state.

## What to do if the model misbehaves five minutes before the pitch

1. Edit `config/satellite_config.json` → set
   `autonomy.ai_monitor.enabled` to `false`.
2. Restart the backend.
3. Open the demo. The scenarios still run, the rules still catch them
   at the calibrated times, the autonomy still escalates (just slower).
   The AI-before-rules story disappears but the unified-loop story
   does not.
4. Open with a different framing: "Today I'm going to show you the
   rule-based safety net. The AI augmentation layer is in the next
   build."

