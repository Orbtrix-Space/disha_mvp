import numpy as np
from datetime import datetime

class MissionState:
    def __init__(self):
        # ==========================================
        # 1. ORBITAL STATE (Physics) - From Week 2
        # ==========================================
        # We initialize with a dummy state for a Low Earth Orbit (LEO)
        # Position (km), Velocity (km/s) in ECI Frame
        self.position = np.array([7000.0, 0.0, 0.0]) 
        self.velocity = np.array([0.0, 7.5, 0.0])    
        self.current_time = datetime.now()

        # ==========================================
        # 2. RESOURCE STATE (Systems) - From Week 4
        # ==========================================
        self.battery_capacity_wh = 100.0  # Total Battery Size
        self.current_battery_wh = 100.0   # Current Charge
        self.data_storage_max_gb = 100.0  # Total Storage Size
        self.current_storage_used_gb = 0.0 # Current Data Used
        self.last_updated = datetime.now()

    def get_state(self):
        """
        Returns the complete status of the satellite.
        """
        # Calculate percentages
        battery_pct = (self.current_battery_wh / self.battery_capacity_wh) * 100.0
        storage_pct = (self.current_storage_used_gb / self.data_storage_max_gb) * 100.0
        
        return {
            "timestamp": self.last_updated,
            # Physics Info
            "position": self.position.tolist(), # Convert numpy to list for JSON
            "velocity": self.velocity.tolist(),
            # System Info
            "battery_pct": round(battery_pct, 2),
            "storage_pct": round(storage_pct, 2),
            "critical_warning": battery_pct < 20.0
        }

    def update_state(self, power_cost_wh: float, data_cost_gb: float):
        """
        Updates the satellite resources (Drains battery, Fills storage).
        """
        # 1. Drain Battery
        self.current_battery_wh -= power_cost_wh
        if self.current_battery_wh < 0:
            self.current_battery_wh = 0 # Cannot go below 0
            
        # 2. Fill Storage
        self.current_storage_used_gb += data_cost_gb
        if self.current_storage_used_gb > self.data_storage_max_gb:
            self.current_storage_used_gb = self.data_storage_max_gb # Cannot overfill
            
        # 3. Update Timestamp
        self.last_updated = datetime.now()
        
        print(f"[SYSTEM] State Updated: Battery {self.current_battery_wh:.1f}Wh, Storage {self.current_storage_used_gb:.1f}GB")