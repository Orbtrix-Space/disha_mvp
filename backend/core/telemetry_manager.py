"""
DISHA Beta — Telemetry Manager
WebSocket Connection Manager, telemetry frame construction, broadcast.
"""

import json
from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections for telemetry broadcast."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        """Accept and register a new WebSocket client."""
        await ws.accept()
        self.active_connections.append(ws)

    def disconnect(self, ws: WebSocket):
        """Remove a disconnected client."""
        if ws in self.active_connections:
            self.active_connections.remove(ws)

    async def broadcast(self, data: dict):
        """Send JSON to all connected clients. Auto-disconnect on failure."""
        message = json.dumps(data)
        disconnected = []
        for ws in self.active_connections:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            if ws in self.active_connections:
                self.active_connections.remove(ws)

    @property
    def client_count(self) -> int:
        return len(self.active_connections)


def build_telemetry_frame(state: dict, fdir_alerts: list = None) -> dict:
    """
    Build telemetry frame from Mission State dict for WebSocket broadcast.
    Structured per spec: position, velocity, power, thermal, comms, attitude, storage.
    """
    pos = state.get("position", [0, 0, 0])
    vel = state.get("velocity", [0, 0, 0])

    r = (pos[0]**2 + pos[1]**2 + pos[2]**2) ** 0.5
    speed = (vel[0]**2 + vel[1]**2 + vel[2]**2) ** 0.5

    frame = {
        "timestamp": state.get("timestamp", ""),
        "position": {
            "latitude": state.get("latitude", 0.0),
            "longitude": state.get("longitude", 0.0),
            "altitude": state.get("altitude_km", r - 6378.137),
        },
        "velocity": {
            "speed": round(speed, 5),
            "vx": round(vel[0], 5),
            "vy": round(vel[1], 5),
            "vz": round(vel[2], 5),
        },
        "power": {
            "battery_soc": state.get("battery_pct", state.get("battery_soc", 100)),
            "battery_voltage": state.get("bus_voltage", 12.0),
            "current_draw": state.get("current_draw", 0.25),
            "solar_current": state.get("solar_panel_current_a", state.get("solar_current", 1.5)),
            "in_eclipse": state.get("in_eclipse", False),
        },
        "thermal": {
            "component_temp": state.get("component_temp", state.get("panel_temp_c", 25.0)),
            "heater_active": state.get("heater_active", False),
        },
        "comms": {
            "link_status": state.get("link_status", "NOMINAL"),
            "snr": state.get("snr_db", state.get("snr", 15.0)),
            "data_rate": state.get("data_rate", 256.0),
            "nearest_station": state.get("nearest_station", "ISTRAC Bangalore"),
        },
        "attitude": {
            "mode": state.get("attitude_mode", state.get("mode", "NADIR")),
            "pointing_error": state.get("pointing_error", 0.1),
            "angular_rate": state.get("angular_rate", 0.01),
        },
        "storage": {
            "used_mb": state.get("storage_used_mb", state.get("storage_used_gb", 0) * 1024),
            "capacity_mb": state.get("storage_capacity_mb", state.get("max_storage_gb", 1024) * 1024),
            "storage_pct": state.get("storage_pct", 0),
        },
        "fdir_alerts": fdir_alerts or [],
        # Legacy flat fields for backward compatibility with existing frontend
        "position_eci": pos,
        "velocity_eci": vel,
        "altitude_km": state.get("altitude_km", r - 6378.137),
        "speed_km_s": round(speed, 5),
        "latitude": state.get("latitude", 0.0),
        "longitude": state.get("longitude", 0.0),
        "battery_wh": state.get("battery_wh", 500),
        "battery_pct": state.get("battery_pct", 100),
        "bus_voltage": state.get("bus_voltage", 12.0),
        "solar_panel_current_a": state.get("solar_panel_current_a", state.get("solar_current", 1.5)),
        "storage_used_gb": state.get("storage_used_gb", 0),
        "storage_pct": state.get("storage_pct", 0),
        "max_battery_wh": state.get("max_battery_wh", 500),
        "max_storage_gb": state.get("max_storage_gb", 1024),
        "panel_temp_c": state.get("panel_temp_c", state.get("component_temp", 25)),
        "battery_temp_c": state.get("battery_temp_c", state.get("battery_temp", 22)),
        "snr_db": state.get("snr_db", state.get("snr", 15)),
        "link_status": state.get("link_status", "NOMINAL"),
        "attitude_mode": state.get("attitude_mode", "NADIR"),
        "payload_status": state.get("payload_status", "IDLE"),
        "in_eclipse": state.get("in_eclipse", False),
        "pointing_error": state.get("pointing_error", 0.1),
        "angular_rate": state.get("angular_rate", 0.01),
        "mode": state.get("link_status", "NOMINAL") == "NOMINAL" and "NOMINAL" or "DEGRADED",
    }

    return frame
