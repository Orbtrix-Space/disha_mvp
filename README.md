# DISHA — Satellite Mission Control

Deterministic satellite operations dashboard with real-time telemetry, orbit propagation, ground station contact prediction, FDIR monitoring, and autonomous mission planning.

## Architecture

```
disha_mvp/
├── backend/                # Python/FastAPI server
│   ├── main.py             # App entry, simulation tick loop
│   ├── core/               # Engine modules
│   │   ├── flight_dynamics.py
│   │   ├── mission_state.py
│   │   ├── tle_manager.py
│   │   ├── fdir_engine.py
│   │   ├── constraint_engine.py
│   │   ├── autonomy_manager.py
│   │   ├── power_module.py
│   │   ├── ground_stations.py
│   │   ├── mission_planner.py
│   │   ├── command_engine.py
│   │   └── telemetry_manager.py
│   ├── api/                # Route modules
│   │   ├── core.py         # GET / , /satellite-status, POST /reset
│   │   ├── tle.py          # POST /tle/load, GET /tle/current
│   │   ├── flight.py       # Orbit prediction, orbital elements, passes
│   │   ├── fdir.py         # FDIR alerts, status, summary
│   │   ├── planning.py     # Generate plan, power prediction, commands
│   │   ├── intelligence.py # Autonomy, constraints, power projection
│   │   └── websocket.py    # WS /ws/telemetry
│   ├── models/
│   │   ├── config.py       # JSON config loader
│   │   ├── schemas.py      # Pydantic models
│   │   └── constants.py    # WGS84 constants
│   └── requirements.txt
├── frontend/               # React 19 + Vite 7
│   └── src/
│       ├── pages/          # ControlDashboard, FlightDashboard, FDIRDashboard, ScheduleDashboard
│       ├── components/     # CesiumGlobe, GroundTrack2D, Telemetry, ControlStrip, etc.
│       ├── hooks/          # useWebSocket
│       └── services/       # API client
├── config/
│   └── satellite_config.json   # Thresholds, ground stations, power specs
├── Dockerfile
└── docker-compose.yml
```

## Requirements

| Tool | Version |
|------|---------|
| Python | >= 3.11 |
| Node.js | >= 20 |
| npm | >= 10 |

### Backend Dependencies

```
fastapi >= 0.104.0
uvicorn[standard] >= 0.24.0
numpy >= 1.24.0
pydantic >= 2.0.0
sgp4 >= 2.22
httpx >= 0.25.0
websockets >= 12.0
python-multipart >= 0.0.6
```

### Frontend Dependencies

React 19, Vite 7, CesiumJS, Leaflet, Recharts, Lucide React, React Router DOM.

## Quick Start

### 1. Clone

```bash
git clone https://github.com/<your-username>/disha_mvp.git
cd disha_mvp
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
cd ..
PYTHONPATH=. uvicorn backend.main:app --port 8000
```

On Windows (PowerShell):
```powershell
$env:PYTHONPATH="."
uvicorn backend.main:app --port 8000
```

The API starts at `http://localhost:8000`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`. Connects to the backend WebSocket for live telemetry.

### 4. Docker (single command)

```bash
docker compose up --build
```

Serves everything on `http://localhost:8000`.

## Usage

1. Start the backend, then the frontend.
2. The dashboard opens on the **Control** page — 3D globe (CesiumJS), 2D ground track (Leaflet), and telemetry sidebar.
3. Load a satellite via TLE (e.g. ISS 25544, Landsat 9 49260) from the Flight page.
4. **Control** — Live orbit visualization, command terminal, event log, ground contact status.
5. **Flight** — Orbital elements, pass predictions, power/SOC charts.
6. **Monitor** — FDIR alerts, subsystem health, anomaly history.
7. **Schedule** — Mission planner, task scheduling, command queue.

## Configuration

Edit `config/satellite_config.json` to change:

- Orbit initial conditions
- Power specs (battery capacity, solar panel area, consumption rates)
- Thermal thresholds
- Ground station list (default: 8 ISRO ISTRAC stations)
- FDIR thresholds
- Autonomy rules

## Key Design Decisions

- **No AI/ML** — All decision-making is deterministic (rule-based FDIR, constraint evaluation, autonomy levels).
- **No paid APIs** — CesiumJS with open tile providers, CartoDB dark tiles for Leaflet.
- **SGP4 propagation** — TLE-based orbit propagation via the `sgp4` library.
- **WebSocket telemetry** — 1 Hz tick loop pushes telemetry frames to all connected clients.

## License

Private — All rights reserved.
