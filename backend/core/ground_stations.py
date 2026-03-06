"""
DISHA Beta — Ground Station Module
8 pre-configured ISRO ISTRAC stations + pass prediction.
"""

from datetime import timedelta
import numpy as np
from backend.core.flight_dynamics import propagate_orbit, eci_to_ecef, is_visible
from backend.models.config import get_config


# 8 ISRO ISTRAC ground stations (spec-compliant)
DEFAULT_GROUND_STATIONS = [
    {"name": "ISTRAC Bangalore", "lat": 12.95, "lon": 77.70, "alt_m": 920, "min_elevation_deg": 5, "country": "India"},
    {"name": "ISTRAC Lucknow", "lat": 26.85, "lon": 80.95, "alt_m": 123, "min_elevation_deg": 5, "country": "India"},
    {"name": "ISTRAC Sriharikota", "lat": 13.72, "lon": 80.23, "alt_m": 3, "min_elevation_deg": 5, "country": "India"},
    {"name": "ISTRAC Thiruvananthapuram", "lat": 8.52, "lon": 76.93, "alt_m": 64, "min_elevation_deg": 5, "country": "India"},
    {"name": "ISTRAC Port Blair", "lat": 11.62, "lon": 92.73, "alt_m": 16, "min_elevation_deg": 5, "country": "India"},
    {"name": "ISTRAC Mauritius", "lat": -20.10, "lon": 57.55, "alt_m": 422, "min_elevation_deg": 5, "country": "Mauritius"},
    {"name": "ISTRAC Brunei", "lat": 4.93, "lon": 114.95, "alt_m": 23, "min_elevation_deg": 5, "country": "Brunei"},
    {"name": "ISTRAC Biak", "lat": -1.17, "lon": 136.10, "alt_m": 46, "min_elevation_deg": 5, "country": "Indonesia"},
]


def get_ground_stations() -> list:
    """Get configured ground stations from config or defaults."""
    config = get_config()
    stations = config.get("ground_stations", DEFAULT_GROUND_STATIONS)
    # Ensure all stations have country field
    for s in stations:
        if "country" not in s:
            s["country"] = "Unknown"
    return stations


# Legacy compatibility
GROUND_STATIONS = DEFAULT_GROUND_STATIONS


class GroundStationPassPredictor:
    """
    Predicts ground station contact windows.
    Steps through orbit at 10-second intervals, checks elevation for each station.
    """

    def __init__(self, min_duration_sec: float = 30.0):
        self.min_duration_sec = min_duration_sec

    def compute_passes(self, mission_state, duration_hours: float = 24.0) -> list:
        """
        Compute pass windows for all stations over given duration.
        Returns list of pass dicts sorted by AOS time.
        """
        stations = get_ground_stations()

        initial_state = {
            "position": mission_state.position.tolist() if hasattr(mission_state.position, 'tolist') else list(mission_state.position),
            "velocity": mission_state.velocity.tolist() if hasattr(mission_state.velocity, 'tolist') else list(mission_state.velocity),
            "epoch": mission_state.current_time,
        }

        duration_sec = duration_hours * 3600.0
        step_size = 10.0  # 10-second intervals per spec
        trajectory = propagate_orbit(initial_state, duration_sec, step_size=step_size)
        sim_start = mission_state.current_time

        all_passes = []

        for station in stations:
            min_elev = station.get("min_elevation_deg", 5.0)
            station_alt_km = station.get("alt_m", 0) / 1000.0

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
                    min_elevation_deg=min_elev,
                    station_alt_km=station_alt_km,
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
                    if duration >= self.min_duration_sec:
                        all_passes.append({
                            "station_name": station["name"],
                            "latitude": station["lat"],
                            "longitude": station["lon"],
                            "country": station.get("country", "Unknown"),
                            "aos_time": window_start.isoformat(),
                            "los_time": current_dt.isoformat(),
                            "duration_sec": round(duration, 1),
                            "max_elevation_deg": round(float(max_elev), 2),
                        })

            # Close pass still in progress at end of simulation
            if in_view and window_start:
                end_dt = sim_start + timedelta(seconds=duration_sec)
                duration = (end_dt - window_start).total_seconds()
                if duration >= self.min_duration_sec:
                    all_passes.append({
                        "station_name": station["name"],
                        "latitude": station["lat"],
                        "longitude": station["lon"],
                        "country": station.get("country", "Unknown"),
                        "aos_time": window_start.isoformat(),
                        "los_time": end_dt.isoformat(),
                        "duration_sec": round(duration, 1),
                        "max_elevation_deg": round(float(max_elev), 2),
                    })

        all_passes.sort(key=lambda p: p["aos_time"])
        return all_passes
