import random
import numpy as np
from datetime import datetime, timedelta, timezone
from src.core.flight_dynamics.propagator import rk4_step
from src.core.flight_dynamics.transforms import eci_to_ecef, ecef_to_lla


class MissionState:
    MAX_BATTERY_WH = 500.0
    MAX_STORAGE_GB = 1024.0

    def __init__(self):
        # Orbit state
        self.position = np.array([7000.0, 0.0, 0.0])
        self.velocity = np.array([0.0, 7.5, 0.0])
        self.last_updated = datetime.now(timezone.utc)
        self.current_time = datetime.now(timezone.utc)

        # Power subsystem
        self.current_battery_wh = self.MAX_BATTERY_WH
        self.current_storage_used_gb = 0.0
        self.bus_voltage = 12.0
        self.solar_panel_current = 1.5

        # Thermal subsystem
        self.panel_temp_c = 25.0
        self.battery_temp_c = 22.0

        # Comms subsystem
        self.snr_db = 15.0
        self.link_status = "NOMINAL"

        # Attitude & Payload
        self.attitude_mode = "NADIR"
        self.payload_status = "IDLE"

        self.tle_manager = None

    def tick(self, dt_seconds: float = 1.0):
        """Advance satellite state by dt_seconds. Called by telemetry loop."""
        if self.tle_manager and self.tle_manager.satrec:
            self.current_time = self.current_time + timedelta(seconds=dt_seconds)
            pos, vel = self.tle_manager.propagate_at(self.current_time)
            self.position = np.array(pos)
            self.velocity = np.array(vel)
        else:
            state_vec = np.concatenate((self.position, self.velocity))
            new_state = rk4_step(state_vec, dt_seconds)
            self.position = new_state[:3]
            self.velocity = new_state[3:]
            self.current_time = self.current_time + timedelta(seconds=dt_seconds)

        # Simulate subsystem state changes
        self.bus_voltage = 12.0 + random.uniform(-0.3, 0.3)
        self.solar_panel_current = max(0.0, 1.5 + 0.3 * random.uniform(-1, 1))
        self.panel_temp_c = 25 + 15 * random.uniform(-1, 1)
        self.battery_temp_c = 22 + 5 * random.uniform(-1, 1)
        self.snr_db = 15.0 + 3.0 * random.uniform(-1, 1)

        self.last_updated = datetime.now(timezone.utc)

    def get_state(self):
        r_ecef = eci_to_ecef(self.position.tolist(), self.current_time)
        lla = ecef_to_lla(r_ecef)
        r = np.linalg.norm(self.position)
        altitude_km = r - 6378.137

        return {
            "timestamp": self.current_time.isoformat(),
            "position": self.position.tolist(),
            "velocity": self.velocity.tolist(),
            "latitude": round(lla["lat"], 6),
            "longitude": round(lla["lon"], 6),
            "altitude_km": round(altitude_km, 3),
            # Power
            "battery_wh": round(self.current_battery_wh, 2),
            "battery_pct": round((self.current_battery_wh / self.MAX_BATTERY_WH) * 100, 2),
            "bus_voltage": round(self.bus_voltage, 2),
            "solar_panel_current_a": round(self.solar_panel_current, 2),
            "storage_used_gb": round(self.current_storage_used_gb, 2),
            "storage_pct": round((self.current_storage_used_gb / self.MAX_STORAGE_GB) * 100, 2),
            "max_battery_wh": self.MAX_BATTERY_WH,
            "max_storage_gb": self.MAX_STORAGE_GB,
            # Thermal
            "panel_temp_c": round(self.panel_temp_c, 1),
            "battery_temp_c": round(self.battery_temp_c, 1),
            # Comms
            "snr_db": round(self.snr_db, 1),
            "link_status": self.link_status,
            # Attitude & Payload
            "attitude_mode": self.attitude_mode,
            "payload_status": self.payload_status,
        }

    def update_state(self, power_cost_wh, data_cost_gb):
        self.current_battery_wh = max(0, self.current_battery_wh - power_cost_wh)
        self.current_storage_used_gb = min(
            self.MAX_STORAGE_GB, self.current_storage_used_gb + data_cost_gb
        )
