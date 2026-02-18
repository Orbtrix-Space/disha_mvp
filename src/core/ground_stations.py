from datetime import timedelta
import numpy as np
from src.core.flight_dynamics.propagator import propagate_orbit
from src.core.flight_dynamics.transforms import eci_to_ecef
from src.core.flight_dynamics.geometry import is_visible


GROUND_STATIONS = [
    {"name": "ISTRAC Bangalore", "lat": 13.0340, "lon": 77.5116, "country": "India"},
    {"name": "ISRO Lucknow", "lat": 26.9124, "lon": 80.9462, "country": "India"},
    {"name": "Svalbard SvalSat", "lat": 78.2307, "lon": 15.3976, "country": "Norway"},
    {"name": "KSAT Tromso", "lat": 69.6628, "lon": 18.9408, "country": "Norway"},
    {"name": "NASA Wallops", "lat": 37.9402, "lon": -75.4664, "country": "USA"},
]


class GroundStationPassPredictor:
    """
    Predicts ground station contact windows using the same pattern as check_feasibility().
    Propagates orbit at 30s steps, checks is_visible() for each station.
    """

    def __init__(self, min_elevation_deg: float = 10.0):
        self.min_elevation_deg = min_elevation_deg

    def compute_passes(self, mission_state, duration_hours: float = 24.0):
        """
        Compute pass windows for all ground stations over given duration.
        Returns list of pass dicts sorted by AOS time.
        """
        initial_state = {
            "position": mission_state.position.tolist(),
            "velocity": mission_state.velocity.tolist(),
            "epoch": mission_state.current_time,
        }

        duration_sec = duration_hours * 3600.0
        step_size = 30.0  # 30s resolution for pass detection

        trajectory = propagate_orbit(initial_state, duration_sec, step_size=step_size)
        sim_start = mission_state.current_time

        all_passes = []

        for station in GROUND_STATIONS:
            in_view = False
            window_start = None
            max_elev = 0.0

            for step in trajectory:
                t_offset = step["time_offset"]
                current_dt = sim_start + timedelta(seconds=float(t_offset))
                r_eci = step["eci_state"][:3]
                r_ecef = eci_to_ecef(r_eci, current_dt)

                visible, elevation = is_visible(
                    r_ecef, station["lat"], station["lon"],
                    min_elevation_deg=self.min_elevation_deg,
                )

                if visible and not in_view:
                    in_view = True
                    window_start = current_dt
                    max_elev = elevation

                elif visible and in_view:
                    max_elev = max(max_elev, elevation)

                elif not visible and in_view:
                    in_view = False
                    duration = (current_dt - window_start).total_seconds()
                    all_passes.append({
                        "station_name": station["name"],
                        "latitude": station["lat"],
                        "longitude": station["lon"],
                        "country": station["country"],
                        "aos_time": window_start.isoformat(),
                        "los_time": current_dt.isoformat(),
                        "duration_sec": round(duration, 1),
                        "max_elevation_deg": round(float(max_elev), 2),
                    })

            # Close any pass still in progress at end of simulation
            if in_view and window_start:
                end_dt = sim_start + timedelta(seconds=duration_sec)
                duration = (end_dt - window_start).total_seconds()
                all_passes.append({
                    "station_name": station["name"],
                    "latitude": station["lat"],
                    "longitude": station["lon"],
                    "country": station["country"],
                    "aos_time": window_start.isoformat(),
                    "los_time": end_dt.isoformat(),
                    "duration_sec": round(duration, 1),
                    "max_elevation_deg": round(float(max_elev), 2),
                })

        # Sort by AOS time
        all_passes.sort(key=lambda p: p["aos_time"])
        return all_passes
