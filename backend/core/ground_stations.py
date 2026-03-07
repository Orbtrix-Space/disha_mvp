"""
DISHA Beta — Ground Station Module
8 pre-configured ISRO ISTRAC stations + pass prediction.
"""

from datetime import timedelta
import numpy as np
from backend.core.flight_dynamics import propagate_orbit, eci_to_ecef, is_visible
from backend.models.config import get_config


# ====================================================
# GROUND STATION NETWORK PRESETS
# ====================================================

STATION_PRESETS = {
    "NONE": [],
    "ISRO": [
        {"name": "ISTRAC Bangalore", "lat": 12.95, "lon": 77.70, "alt_m": 920, "min_elevation_deg": 5, "country": "India"},
        {"name": "ISTRAC Lucknow", "lat": 26.85, "lon": 80.95, "alt_m": 123, "min_elevation_deg": 5, "country": "India"},
        {"name": "ISTRAC Sriharikota", "lat": 13.72, "lon": 80.23, "alt_m": 3, "min_elevation_deg": 5, "country": "India"},
        {"name": "ISTRAC Thiruvananthapuram", "lat": 8.52, "lon": 76.93, "alt_m": 64, "min_elevation_deg": 5, "country": "India"},
        {"name": "ISTRAC Port Blair", "lat": 11.62, "lon": 92.73, "alt_m": 16, "min_elevation_deg": 5, "country": "India"},
        {"name": "ISTRAC Mauritius", "lat": -20.10, "lon": 57.55, "alt_m": 422, "min_elevation_deg": 5, "country": "Mauritius"},
        {"name": "ISTRAC Brunei", "lat": 4.93, "lon": 114.95, "alt_m": 23, "min_elevation_deg": 5, "country": "Brunei"},
        {"name": "ISTRAC Biak", "lat": -1.17, "lon": 136.10, "alt_m": 46, "min_elevation_deg": 5, "country": "Indonesia"},
    ],
    "NASA": [
        {"name": "Goldstone DSN", "lat": 35.43, "lon": -116.89, "alt_m": 900, "min_elevation_deg": 5, "country": "USA"},
        {"name": "Madrid DSN", "lat": 40.43, "lon": -4.25, "alt_m": 830, "min_elevation_deg": 5, "country": "Spain"},
        {"name": "Canberra DSN", "lat": -35.40, "lon": 148.98, "alt_m": 680, "min_elevation_deg": 5, "country": "Australia"},
        {"name": "Wallops Island", "lat": 37.94, "lon": -75.46, "alt_m": 3, "min_elevation_deg": 5, "country": "USA"},
        {"name": "White Sands", "lat": 32.50, "lon": -106.61, "alt_m": 1200, "min_elevation_deg": 5, "country": "USA"},
        {"name": "McMurdo", "lat": -77.85, "lon": 166.67, "alt_m": 10, "min_elevation_deg": 5, "country": "Antarctica"},
    ],
    "ESA": [
        {"name": "ESTRACK Kiruna", "lat": 67.86, "lon": 20.96, "alt_m": 402, "min_elevation_deg": 5, "country": "Sweden"},
        {"name": "ESTRACK Redu", "lat": 50.00, "lon": 5.15, "alt_m": 380, "min_elevation_deg": 5, "country": "Belgium"},
        {"name": "ESTRACK Cebreros", "lat": 40.45, "lon": -4.37, "alt_m": 794, "min_elevation_deg": 5, "country": "Spain"},
        {"name": "ESTRACK Malargue", "lat": -35.78, "lon": -69.40, "alt_m": 1550, "min_elevation_deg": 5, "country": "Argentina"},
        {"name": "ESTRACK New Norcia", "lat": -31.05, "lon": 116.19, "alt_m": 252, "min_elevation_deg": 5, "country": "Australia"},
        {"name": "ESTRACK Kourou", "lat": 5.25, "lon": -52.80, "alt_m": 12, "min_elevation_deg": 5, "country": "French Guiana"},
    ],
    "KSAT": [
        {"name": "SvalSat Svalbard", "lat": 78.23, "lon": 15.41, "alt_m": 450, "min_elevation_deg": 5, "country": "Norway"},
        {"name": "KSAT Tromso", "lat": 69.66, "lon": 18.94, "alt_m": 130, "min_elevation_deg": 5, "country": "Norway"},
        {"name": "KSAT Grimstad", "lat": 58.34, "lon": 8.36, "alt_m": 20, "min_elevation_deg": 5, "country": "Norway"},
        {"name": "KSAT Puertollano", "lat": 38.69, "lon": -4.10, "alt_m": 700, "min_elevation_deg": 5, "country": "Spain"},
        {"name": "KSAT Mauritius", "lat": -20.10, "lon": 57.55, "alt_m": 422, "min_elevation_deg": 5, "country": "Mauritius"},
        {"name": "KSAT Punta Arenas", "lat": -53.14, "lon": -70.91, "alt_m": 20, "min_elevation_deg": 5, "country": "Chile"},
    ],
    "GLOBAL": [
        {"name": "SvalSat Svalbard", "lat": 78.23, "lon": 15.41, "alt_m": 450, "min_elevation_deg": 5, "country": "Norway"},
        {"name": "KSAT Tromso", "lat": 69.66, "lon": 18.94, "alt_m": 130, "min_elevation_deg": 5, "country": "Norway"},
        {"name": "Goldstone DSN", "lat": 35.43, "lon": -116.89, "alt_m": 900, "min_elevation_deg": 5, "country": "USA"},
        {"name": "ISTRAC Bangalore", "lat": 12.95, "lon": 77.70, "alt_m": 920, "min_elevation_deg": 5, "country": "India"},
        {"name": "Canberra DSN", "lat": -35.40, "lon": 148.98, "alt_m": 680, "min_elevation_deg": 5, "country": "Australia"},
        {"name": "ESTRACK Kourou", "lat": 5.25, "lon": -52.80, "alt_m": 12, "min_elevation_deg": 5, "country": "French Guiana"},
        {"name": "KSAT Punta Arenas", "lat": -53.14, "lon": -70.91, "alt_m": 20, "min_elevation_deg": 5, "country": "Chile"},
        {"name": "McMurdo", "lat": -77.85, "lon": 166.67, "alt_m": 10, "min_elevation_deg": 5, "country": "Antarctica"},
    ],
}

DEFAULT_GROUND_STATIONS = STATION_PRESETS["ISRO"]

# Runtime active stations (mutable — changed via API)
_active_stations = list(DEFAULT_GROUND_STATIONS)
_active_network = "ISRO"


def get_ground_stations() -> list:
    """Get currently active ground stations."""
    for s in _active_stations:
        if "country" not in s:
            s["country"] = "Unknown"
    return _active_stations


def set_ground_stations(network: str = None, stations: list = None) -> dict:
    """Set active ground stations by preset name or custom list."""
    global _active_stations, _active_network
    if network and network in STATION_PRESETS:
        _active_stations = list(STATION_PRESETS[network])
        _active_network = network
    elif stations:
        _active_stations = list(stations)
        _active_network = "CUSTOM"
    else:
        return {"status": "ERROR", "message": f"Unknown network: {network}"}
    return {"status": "SUCCESS", "network": _active_network, "count": len(_active_stations)}


def add_custom_station(name: str, lat: float, lon: float, alt_m: float = 0, min_elevation_deg: float = 5) -> dict:
    """Add a custom ground station to the active list."""
    global _active_network
    station = {
        "name": name,
        "lat": round(lat, 4),
        "lon": round(lon, 4),
        "alt_m": alt_m,
        "min_elevation_deg": min_elevation_deg,
        "country": "Custom",
    }
    _active_stations.append(station)
    _active_network = "CUSTOM"
    return {"status": "SUCCESS", "network": _active_network, "count": len(_active_stations), "added": station}


def remove_station(name: str) -> dict:
    """Remove a station by name from the active list."""
    global _active_network
    before = len(_active_stations)
    _active_stations[:] = [s for s in _active_stations if s["name"] != name]
    removed = before - len(_active_stations)
    if removed:
        _active_network = "CUSTOM"
    return {"status": "SUCCESS", "removed": removed, "count": len(_active_stations)}


def get_available_networks() -> dict:
    """Return list of preset networks with station counts."""
    return {name: len(stations) for name, stations in STATION_PRESETS.items()}


def get_active_network() -> str:
    return _active_network


# Legacy compatibility
GROUND_STATIONS = DEFAULT_GROUND_STATIONS


def check_contact_now(position_eci: list, current_time) -> dict:
    """
    Check if satellite is in contact with any ground station RIGHT NOW.
    Returns {"in_contact": bool, "station": str|None, "elevation_deg": float}.
    """
    stations = get_ground_stations()
    r_ecef = eci_to_ecef(position_eci, current_time)

    best_station = None
    best_elevation = 0.0

    for station in stations:
        min_elev = station.get("min_elevation_deg", 5.0)
        station_alt_km = station.get("alt_m", 0) / 1000.0
        visible, elevation = is_visible(
            r_ecef, station["lat"], station["lon"],
            min_elevation_deg=min_elev,
            station_alt_km=station_alt_km,
        )
        if visible and elevation > best_elevation:
            best_station = station["name"]
            best_elevation = elevation

    return {
        "in_contact": best_station is not None,
        "station": best_station,
        "elevation_deg": round(best_elevation, 2),
    }


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
