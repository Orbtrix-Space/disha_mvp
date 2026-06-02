# DISHA — Demo Scenario Calibration Log

Generated: 2026-05-17 17:24 UTC  
Source: `backend/scripts/calibrate_demo_scenarios.py`  
Reruns: run that script to refresh after any change to `demo_scenarios.py`, `mission_state.py`, or the AI weights.

Each row is the median over 5 independent simulated runs. `ai_catch_sec` is when `anomaly_score` first reached 0.4. `rule_catch_sec` is when the first FDIR alert fired on a field the scenario actually drives. `autonomy_react_sec` is when autonomy first changed mode. `recovery_sec` is how long after cancel `anomaly_score` returned below 0.2.

## `thermal_drift` — Thermal Drift

_Battery temperature is slowly rising. It will stay inside the rule threshold for nearly eight minutes. The AI sees the rate of change diverge from the panel temperature baseline and flags it within the first minute._

**Expected (from spec):** AI flags ≤ 60.0s · rules fire ≥ 460.0s · autonomy reacts ≤ 90.0s · ramp 30.0s / recovery 30.0s.

**Fields affected:** battery_temp

| run | ai_catch_sec | rule_catch_sec | autonomy_react_sec | cancel_at_sec | recovery_sec | AI<rules |
|----:|-------------:|---------------:|--------------:|-------------:|-------------:|:--------|
| 1 | 1.0 | 461.0 | 8.0 | 461.0 | 30.0 | YES |
| 2 | 5.0 | 461.0 | 8.0 | 461.0 | 30.0 | YES |
| 3 | 1.0 | 461.0 | 8.0 | 461.0 | 30.0 | YES |
| 4 | 5.0 | 461.0 | 8.0 | 461.0 | 30.0 | YES |
| 5 | 5.0 | 461.0 | 8.0 | 461.0 | 30.0 | YES |

**Medians:** ai_catch=5.0s · rule_catch=461.0s · autonomy_react=8.0s · recovery=30.0s · AI_before_rules **5/5**.

## `battery_degradation` — Battery Capacity Degradation

_Battery state-of-charge is dropping faster than the load profile predicts. The absolute SOC stays above the warning threshold for five minutes. The AI catches it because the relationship between current draw, solar input, and SOC has shifted from the training distribution._

**Expected (from spec):** AI flags ≤ 60.0s · rules fire ≥ 300.0s · autonomy reacts ≤ 90.0s · ramp 30.0s / recovery 45.0s.

**Fields affected:** battery_soc, battery_pct, battery_wh

| run | ai_catch_sec | rule_catch_sec | autonomy_react_sec | cancel_at_sec | recovery_sec | AI<rules |
|----:|-------------:|---------------:|--------------:|-------------:|-------------:|:--------|
| 1 | 1.0 | 303.0 | 1.0 | 303.0 | 45.0 | YES |
| 2 | 1.0 | 303.0 | 1.0 | 303.0 | 45.0 | YES |
| 3 | 1.0 | 303.0 | 1.0 | 303.0 | 45.0 | YES |
| 4 | 1.0 | 303.0 | 1.0 | 303.0 | 45.0 | YES |
| 5 | 1.0 | 303.0 | 1.0 | 303.0 | 45.0 | YES |

**Medians:** ai_catch=1.0s · rule_catch=303.0s · autonomy_react=1.0s · recovery=45.0s · AI_before_rules **5/5**.

## `pointing_snr_correlation` — Pointing and SNR Drift

_Pointing error is climbing while SNR is falling, both well inside their rule thresholds. The AI catches the correlation immediately because the joint distribution is what it learned in training, not the marginal numbers._

**Expected (from spec):** AI flags ≤ 75.0s · rules fire ≥ 720.0s · autonomy reacts ≤ 120.0s · ramp 30.0s / recovery 30.0s.

**Fields affected:** pointing_error, snr

| run | ai_catch_sec | rule_catch_sec | autonomy_react_sec | cancel_at_sec | recovery_sec | AI<rules |
|----:|-------------:|---------------:|--------------:|-------------:|-------------:|:--------|
| 1 | 7.0 | 721.0 | 52.0 | 721.0 | 30.0 | YES |
| 2 | 21.0 | 721.0 | 63.0 | 721.0 | 30.0 | YES |
| 3 | 21.0 | 721.0 | 48.0 | 721.0 | 30.0 | YES |
| 4 | 16.0 | 721.0 | 48.0 | 721.0 | 30.0 | YES |
| 5 | 5.0 | 721.0 | 54.0 | 721.0 | 30.0 | YES |

**Medians:** ai_catch=16.0s · rule_catch=721.0s · autonomy_react=52.0s · recovery=30.0s · AI_before_rules **5/5**.

