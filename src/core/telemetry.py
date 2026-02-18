import json
import random
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active_connections.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active_connections:
            self.active_connections.remove(ws)

    async def broadcast(self, data: dict):
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


def build_telemetry_frame(state: dict) -> dict:
    pos = state["position"]
    vel = state["velocity"]

    r = (pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2) ** 0.5
    altitude_km = r - 6378.137
    speed_km_s = (vel[0] ** 2 + vel[1] ** 2 + vel[2] ** 2) ** 0.5

    return {
        "timestamp": state["timestamp"],
        "position_eci": pos,
        "velocity_eci": vel,
        "altitude_km": round(altitude_km, 3),
        "speed_km_s": round(speed_km_s, 5),
        "latitude": state.get("latitude", 0.0),
        "longitude": state.get("longitude", 0.0),
        "battery_wh": state["battery_wh"],
        "battery_pct": state["battery_pct"],
        "storage_used_gb": state["storage_used_gb"],
        "storage_pct": state["storage_pct"],
        "max_battery_wh": state["max_battery_wh"],
        "max_storage_gb": state["max_storage_gb"],
        # Placeholder subsystem data
        "temperature_c": round(20 + 10 * random.uniform(-1, 1), 1),
        "attitude_quaternion": [1.0, 0.0, 0.0, 0.0],
        "solar_panel_current_a": round(1.5 + 0.3 * random.uniform(-1, 1), 2),
        "mode": "NOMINAL",
    }
