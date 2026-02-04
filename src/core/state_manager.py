import json
import os
from datetime import datetime
 
class MissionState:
    def __init__(self):
        # 1. Load the Static Configuration (The "Factory Specs")
        self.config = self._load_config()
 
        # 2. Initialize Dynamic State (The "Live Status")
        # We assume the satellite launches fully charged and empty storage
        self.battery_level_wh = self.config["power_system"]["max_battery_capacity_wh"]
        self.storage_used_gb = 0.0
        # We assume the satellite starts exactly where the config says (Epoch)
        # We keep these as simple lists for now (no NumPy yet to keep it simple)
        self.position = self.config["orbit"]["position_km"]
        self.velocity = self.config["orbit"]["velocity_km_s"]
        # Parse the ISO format time string into a real datetime object
        # We replace 'Z' with '+00:00' to make Python happy with timezones
        self.current_time = datetime.fromisoformat(self.config["orbit"]["epoch"].replace('Z', '+00:00'))
 
    def _load_config(self):
        """
        Helper to safely find and load the JSON file from the data/ folder.
        """
        try:
            # Get the path to THIS file (state_manager.py)
            current_dir = os.path.dirname(os.path.abspath(__file__))
            # Go up two levels to find the root folder (src/core/ -> src/ -> root)
            project_root = os.path.dirname(os.path.dirname(current_dir))
            # Construct path to data/mission_config.json
            config_path = os.path.join(project_root, 'data', 'mission_config.json')
 
            with open(config_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"[ERROR] Critical Failure: Could not load mission_config.json. Reason: {e}")
            return {}
 
    def get_state(self):
        """
        Returns a clean dictionary of the current health.
        Used by Decision Manager and Flight Dynamics.
        """
        max_battery = self.config["power_system"]["max_battery_capacity_wh"]
        return {
            "timestamp": str(self.current_time),
            "position": self.position,
            "battery_wh": self.battery_level_wh,
            "battery_pct": (self.battery_level_wh / max_battery) * 100.0,
            "storage_gb": self.storage_used_gb
        }
 
# --- TEST BLOCK (Runs only if you execute this file directly) ---
if __name__ == "__main__":
    satellite = MissionState()
    print("--------------------------------------")
    print("      DISHA SATELLITE STATE TEST      ")
    print("--------------------------------------")
    # Check if config loaded
    if hasattr(satellite, 'config') and satellite.config:
        print(f"[OK] Config Loaded. Max Battery: {satellite.config['power_system']['max_battery_capacity_wh']} Wh")
    else:
        print("[FAIL] Config not loaded.")
    # Check if state is reporting
    print(f"[OK] Current State: {satellite.get_state()}")
    print("--------------------------------------")