# DISHA — Demo Operator Notes

How to run the demo and what each page shows. Click-by-click investor script
lives in the showcase deck; this file is the operator-side reference.

---

## 1. Run it

```powershell
# Backend (FastAPI, tick loop at 1 Hz)
$env:PYTHONPATH = "."
uvicorn backend.main:app --port 8000

# Frontend (Vite dev server, port 5173)
cd frontend
npm install   # first time only
npm run dev
```

Open `http://localhost:5173`. The four pages (CONTROL · FLIGHT · MONITOR ·
SCHEDULE) are routes in the top nav.

---

## 2. Pages — what each one is for

| Page | Purpose | Key visuals |
|---|---|---|
| **CONTROL** | Live ops · autonomy decisions · telecommand pipeline | 3D globe + 2D map · autonomy mode pill · live telemetry strip charts · CCSDS + AES-GCM telecommand modal |
| **FLIGHT** | Automated OD → conjunction → maneuver pipeline | Post-fit residuals plot · convergence sparkline · range-vs-TCA per conjunction · operator catalog upload |
| **MONITOR** | NETRA — health + analytics + context-grounded assistant | 8-axis health radar · stacked risk trend · sensor→constraint→decision→action Sankey · rule heatmap · subsystem small-multiples · NETRA chat |
| **SCHEDULE** | Constellation tasking (3-sat SSO greedy optimizer) | 3D orbital planes · Gantt swimlanes · yield / rejection donuts · per-satellite load · FIFO baseline overlay |

---

## 3. NETRA demo telemetry file

A scripted 60-minute telemetry feed lives at:

- `samples/netra_demo_telemetry.xlsx` — canonical source
- `frontend/public/samples/netra_demo_telemetry.xlsx` — downloadable from the
  running frontend at `/samples/netra_demo_telemetry.xlsx`

On the MONITOR page, switch the sidebar's **Telemetry ingestion** to
**Replay file**, upload that workbook, and play at 16×. The narrative walks
through nominal → comms drop → thermal warning → battery anomaly → critical
combined event → autonomy intervention → recovery. The radar polygon
visibly deforms, the risk trend rises and falls, the rule heatmap lights
up, the NETRA chat cites the right rule/mode change for each operator
question.

Regenerate the file (e.g. after editing the narrative anchors):

```powershell
$env:PYTHONPATH = "."
python backend/scripts/generate_demo_telemetry.py
```

The workbook has three sheets:
- `telemetry` — 360 rows × 23 channels at 10 s cadence
- `packet_definitions` — TM schema with type + length
- `scenario_log` — narrative reference, operator-facing

---

## 4. AI Anomaly Monitor

The MONITOR page's anomaly score + NETRA citations are powered by the small
LSTM autoencoder that ships with DISHA.

```powershell
# Regenerate nominal telemetry (~20 seconds, ~130K samples)
$env:PYTHONPATH = "."
python backend/scripts/generate_training_data.py --hours 12

# Train (~3 minutes on CPU, 50 epochs early-stopped on val loss)
python backend/scripts/train_anomaly_model.py
```

Artifacts land in `backend/fdir/ai_weights/`:
- `model.pt` — torch state_dict + architecture metadata
- `scaler.pkl` — per-feature mean/std for input standardization
- `features.json` — feature order + per-feature reconstruction-error
  mean/std (the calibration for the z-score normalization)

Restart the backend to pick up new weights — the monitor loads once at
startup, not per request.

### What the numbers mean

| Pitch claim | Source of truth | Last measured |
|---|---|---|
| < 100K params | trainer + `AIMonitor.param_count` at boot | **8,680** |
| < 100 ms inference | `monitor.evaluate().inference_latency_ms` | **~15 ms p50** |
| Stable when nominal | mean anomaly_score on held-out 1 h | **< 0.10** |
| Catches the demo scenarios | scenario calibration script + log | **3/3 catch** |

---

## 5. Demo scenarios (control-plane injection)

The control-plane demo injects perturbations into the live simulator —
useful when you want to fire FDIR + autonomy reactions without uploading a
file. Endpoints:

- `POST /demo/inject_anomaly { scenario_id, intensity }`
- `POST /demo/cancel { run_id }`
- `POST /demo/reset`
- `GET  /demo/scenarios`
- `GET  /demo/status`

Scenarios available out of the box: `thermal_drift`, `battery_degradation`,
`pointing_snr_correlation`. Each is calibrated against expected AI-catch,
rule-catch and autonomy-react timestamps in
`backend/control/demo_scenarios_calibration.md`.

---

## 6. Theme + typography

The whole UI uses **Poppins** as the single typeface. Tabular numerics
align via `font-variant-numeric: tabular-nums` on `.mono` — no separate
mono face. Theme tokens in `frontend/src/index.css` (`:root` block) are the
single source of truth:

```css
--bg-primary: #000000;       /* pure-black canvas */
--bg-card:    #0a0a0a;
--accent-cyan:  #4a6f93;     /* primary */
--accent-green: #5e8c6f;     /* nominal */
--accent-yellow:#b39148;     /* warning */
--accent-red:   #b06560;     /* alarm */
```

No glow / no bloom / no text-shadow on numeric readouts. Calm dark canvas,
muted accents, subtle low-opacity borders.

---

## 7. Backend module map

```
backend/
  shared/        dynamics · state · tle · ground · models · power · constraints · commands
  control/       autonomy + demo_scenarios
  flight/        estimation (OD) · conjunction (screening) · pipeline
  fdir/          engine · ai_monitor · history (24h rolling buffer for MONITOR)
  schedule/      constellation (J2) · access · scheduler (greedy + FIFO) · sample_deck
  api/           one file per page surface (core, flight, fdir, planning, intelligence,
                 websocket, recorder, demo, uploads, flight_pipeline, scheduler, monitor)
  main.py        FastAPI app + 1 Hz tick loop
```

Dependency direction: `api/` → page folders → `shared/`. Pages do not
import each other.
