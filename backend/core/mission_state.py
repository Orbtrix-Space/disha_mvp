"""
DISHA Beta — Mission State Manager
Central digital twin object. Single source of truth for all satellite state.
The tick() method advances all subsystems by 1 second.
"""

import random
import numpy as np
from datetime import datetime, timedelta, timezone
from backend.core.flight_dynamics import rk4_step, eci_to_ecef, ecef_to_lla, is_in_eclipse
from backend.models.config import get_config


class MissionState:
    def __init__(self):
        config = get_config()
        orbit_cfg = config.get("orbit", {})
        power_cfg = config.get("power", {})
        thermal_cfg = config.get("thermal", {})
        storage_cfg = config.get("storage", {})
        comms_cfg = config.get("comms", {})

        # Simulation clock
        self.current_time = datetime.now(timezone.utc)
        self.last_updated = datetime.now(timezone.utc)
        self.start_time = datetime.now(timezone.utc)

        # Orbital state (ECI)
        self.position = np.array(orbit_cfg.get("initial_position_eci_km", [7000.0, 0.0, 0.0]))
        self.velocity = np.array(orbit_cfg.get("initial_velocity_eci_km_s", [0.0, 7.5, 0.0]))

        # Geographic position (computed each tick)
        self.latitude = 0.0
        self.longitude = 0.0
        self.altitude_km = 0.0

        # Power subsystem
        self.battery_capacity_wh = power_cfg.get("battery_capacity_wh", 500.0)
        self.current_battery_wh = self.battery_capacity_wh
        self.bus_voltage = power_cfg.get("bus_voltage_nominal_v", 12.0)
        self.solar_panel_current = power_cfg.get("solar_panel_current_nominal_a", 1.5)
        self.solar_array_output_w = power_cfg.get("solar_array_output_w", 18.0)
        self.base_load_w = power_cfg.get("base_load_w", 3.0)
        self.current_draw = self.base_load_w / self.bus_voltage

        # Thermal subsystem
        self.component_temp = thermal_cfg.get("panel_temp_nominal_c", 25.0)
        self.battery_temp = thermal_cfg.get("battery_temp_nominal_c", 22.0)
        self.heater_active = False

        # Comms subsystem
        self.snr_db = comms_cfg.get("snr_nominal_db", 15.0)
        self.link_status = "NOMINAL"
        self.data_rate_kbps = 256.0
        self.nearest_station = "ISTRAC Bangalore"

        # Attitude subsystem
        self.attitude_mode = "NADIR"
        self.pointing_error = 0.1
        self.angular_rate = 0.01

        # Storage subsystem
        self.storage_capacity_mb = storage_cfg.get("capacity_mb", 1048576.0)
        self.storage_used_mb = 0.0

        # Eclipse state
        self.in_eclipse = False

        # FDIR alert list (populated by FDIR engine)
        self.fdir_alerts = []

        # Autonomy state (populated by autonomy manager)
        self.autonomy_mode = "AUTONOMOUS"
        self.autonomy_objective = "Nominal Orbit Maintenance"
        self.autonomy_confidence = 1.0

        # Constraint state
        self.risk_score = 0.0
        self.active_constraints = []

        # Command and schedule state
        self.command_history = []
        self.mission_schedule = []

        # TLE manager reference
        self.tle_manager = None

        # Legacy compatibility
        self.MAX_BATTERY_WH = self.battery_capacity_wh
        self.MAX_STORAGE_GB = self.storage_capacity_mb / 1024.0
        self.current_storage_used_gb = 0.0
        self.panel_temp_c = self.component_temp
        self.battery_temp_c = self.battery_temp
        self.payload_status = "IDLE"
        self.solar_panel_current_a = self.solar_panel_current

    def tick(self, dt_seconds: float = 1.0):
        """Advance satellite state by dt_seconds. Called by simulation loop."""
        # 1. Flight Dynamics: propagate orbit
        if self.tle_manager and self.tle_manager.satrec:
            self.current_time += timedelta(seconds=dt_seconds)
            pos, vel = self.tle_manager.propagate_at(self.current_time)
            self.position = np.array(pos)
            self.velocity = np.array(vel)
        else:
            state_vec = np.concatenate((self.position, self.velocity))
            new_state = rk4_step(state_vec, dt_seconds)
            self.position = new_state[:3]
            self.velocity = new_state[3:]
            self.current_time += timedelta(seconds=dt_seconds)

        # 2. Coordinate transforms: ECI → ECEF → LLA
        r_ecef = eci_to_ecef(self.position.tolist(), self.current_time)
        lla = ecef_to_lla(r_ecef)
        self.latitude = lla["lat"]
        self.longitude = lla["lon"]
        self.altitude_km = np.linalg.norm(self.position) - 6378.137

        # 3. Eclipse check
        self.in_eclipse = is_in_eclipse(self.position.tolist(), self.current_time)

        # 4. Subsystem updates
        self._update_power(dt_seconds)
        self._update_thermal(dt_seconds)
        self._update_comms(dt_seconds)
        self._update_storage(dt_seconds)
        self._update_attitude(dt_seconds)

        # Update legacy fields
        self.last_updated = datetime.now(timezone.utc)
        self.panel_temp_c = self.component_temp
        self.battery_temp_c = self.battery_temp
        self.solar_panel_current_a = self.solar_panel_current
        self.current_storage_used_gb = self.storage_used_mb / 1024.0

    def _update_power(self, dt: float):
        """Update power subsystem based on eclipse/sunlit state."""
        hours = dt / 3600.0

        if self.in_eclipse:
            self.solar_panel_current = 0.0
            net_power = -self.base_load_w
        else:
            self.solar_panel_current = 1.5 + 0.2 * random.uniform(-1, 1)
            net_power = self.solar_array_output_w - self.base_load_w

        self.current_battery_wh = max(0, min(self.battery_capacity_wh,
                                              self.current_battery_wh + net_power * hours))
        self.bus_voltage = 12.0 + random.uniform(-0.3, 0.3)
        self.current_draw = self.base_load_w / max(self.bus_voltage, 1.0)

    def _update_thermal(self, dt: float):
        """Update thermal state based on sun exposure."""
        if self.in_eclipse:
            self.component_temp += random.uniform(-0.5, 0.0) * (dt / 60.0)
            if self.component_temp < -20 and not self.heater_active:
                self.heater_active = True
        else:
            self.component_temp += random.uniform(-0.2, 0.5) * (dt / 60.0)
            if self.component_temp > 10:
                self.heater_active = False

        self.component_temp = max(-50, min(100, self.component_temp))
        self.battery_temp += random.uniform(-0.1, 0.1) * (dt / 60.0)
        self.battery_temp = max(-10, min(55, self.battery_temp))

    def _update_comms(self, dt: float):
        """Update comms state based on proximity to ground stations."""
        self.snr_db = 15.0 + 3.0 * random.uniform(-1, 1)

        if self.snr_db < 5:
            self.link_status = "LOST"
            self.data_rate_kbps = 0.0
        elif self.snr_db < 8:
            self.link_status = "DEGRADED"
            self.data_rate_kbps = 64.0
        else:
            self.link_status = "NOMINAL"
            self.data_rate_kbps = 256.0

    def _update_storage(self, dt: float):
        """Update storage fill based on operations."""
        pass  # Storage changes driven by task execution

    def _update_attitude(self, dt: float):
        """Update attitude state (simplified state machine)."""
        self.pointing_error = max(0.0, 0.1 + 0.05 * random.uniform(-1, 1))
        self.angular_rate = max(0.0, 0.01 + 0.005 * random.uniform(-1, 1))

    def get_state(self) -> dict:
        """Return full state snapshot for API/telemetry."""
        battery_pct = round((self.current_battery_wh / self.battery_capacity_wh) * 100, 2)
        storage_pct = round((self.storage_used_mb / self.storage_capacity_mb) * 100, 2) if self.storage_capacity_mb > 0 else 0

        return {
            "timestamp": self.current_time.isoformat(),
            "position": self.position.tolist(),
            "velocity": self.velocity.tolist(),
            "latitude": round(self.latitude, 6),
            "longitude": round(self.longitude, 6),
            "altitude_km": round(self.altitude_km, 3),
            # Power
            "battery_wh": round(self.current_battery_wh, 2),
            "battery_pct": battery_pct,
            "battery_soc": battery_pct,
            "bus_voltage": round(self.bus_voltage, 2),
            "solar_panel_current_a": round(self.solar_panel_current, 2),
            "solar_current": round(self.solar_panel_current, 2),
            "current_draw": round(self.current_draw, 2),
            "in_eclipse": self.in_eclipse,
            # Storage
            "storage_used_mb": round(self.storage_used_mb, 2),
            "storage_used_gb": round(self.storage_used_mb / 1024.0, 2),
            "storage_pct": storage_pct,
            "storage_capacity_mb": self.storage_capacity_mb,
            "max_battery_wh": self.battery_capacity_wh,
            "max_storage_gb": self.storage_capacity_mb / 1024.0,
            # Thermal
            "component_temp": round(self.component_temp, 1),
            "panel_temp_c": round(self.component_temp, 1),
            "battery_temp": round(self.battery_temp, 1),
            "battery_temp_c": round(self.battery_temp, 1),
            "heater_active": self.heater_active,
            # Comms
            "link_status": self.link_status,
            "snr": round(self.snr_db, 1),
            "snr_db": round(self.snr_db, 1),
            "data_rate": round(self.data_rate_kbps, 1),
            "nearest_station": self.nearest_station,
            # Attitude
            "attitude_mode": self.attitude_mode,
            "mode": self.attitude_mode,
            "pointing_error": round(self.pointing_error, 3),
            "angular_rate": round(self.angular_rate, 4),
            # Payload
            "payload_status": self.payload_status,
        }

    def update_state(self, power_cost_wh: float, data_cost_gb: float):
        """Deduct power and add storage from task execution."""
        self.current_battery_wh = max(0, self.current_battery_wh - power_cost_wh)
        self.storage_used_mb = min(self.storage_capacity_mb,
                                   self.storage_used_mb + data_cost_gb * 1024.0)
        self.current_storage_used_gb = self.storage_used_mb / 1024.0

    def reset(self):
        """Reset to initial state."""
        self.__init__()
