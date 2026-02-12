import numpy as np
from datetime import datetime
from src.core.flight_dynamics import propagate_orbit

class MissionState:
    MAX_BATTERY_WH = 500.0
    MAX_STORAGE_GB = 1024.0

    def __init__(self):
        # Initialize with raw numpy arrays
        self.position = np.array([7000.0, 0.0, 0.0])
        self.velocity = np.array([0.0, 7.5, 0.0])
        self.last_updated = datetime.now()
        self.current_time = datetime.now()

        # Resources
        self.current_battery_wh = self.MAX_BATTERY_WH
        self.current_storage_used_gb = 0.0

    def get_state(self):
        """
        Calculates the NEW position based on time elapsed.
        """
        now = datetime.now()
        dt = (now - self.last_updated).total_seconds()

        if dt > 0:
            initial_state_dict = {
                'position': self.position,
                'velocity': self.velocity,
                'epoch': self.current_time
            }

            result = propagate_orbit(initial_state_dict, dt)

            # result is a list of dicts; grab the last entry
            if isinstance(result, list) and len(result) > 0:
                last = result[-1]["eci_state"]
                self.position = np.array(last[:3])
                self.velocity = np.array(last[3:])
            else:
                self.position = np.array(result[0])
                self.velocity = np.array(result[1])

            self.last_updated = now
            self.current_time = now

        return {
            "timestamp": self.last_updated.isoformat(),
            "position": self.position.tolist(),
            "velocity": self.velocity.tolist(),
            "battery_wh": round(self.current_battery_wh, 2),
            "battery_pct": round((self.current_battery_wh / self.MAX_BATTERY_WH) * 100, 2),
            "storage_used_gb": round(self.current_storage_used_gb, 2),
            "storage_pct": round((self.current_storage_used_gb / self.MAX_STORAGE_GB) * 100, 2),
            "max_battery_wh": self.MAX_BATTERY_WH,
            "max_storage_gb": self.MAX_STORAGE_GB,
        }

    def update_state(self, power_cost_wh, data_cost_gb):
        self.current_battery_wh = max(0, self.current_battery_wh - power_cost_wh)
        self.current_storage_used_gb = min(self.MAX_STORAGE_GB, self.current_storage_used_gb + data_cost_gb)
