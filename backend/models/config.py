"""
DISHA Beta — Configuration Loader
Loads satellite parameters, thresholds, stations from JSON config.
"""

import json
import os

_config = None
_config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "satellite_config.json")


def load_config(path: str = None) -> dict:
    """Load satellite configuration from JSON file."""
    global _config
    if _config is not None and path is None:
        return _config

    config_file = path or _config_path
    if os.path.exists(config_file):
        with open(config_file, "r") as f:
            _config = json.load(f)
    else:
        _config = _get_default_config()

    return _config


def get_config() -> dict:
    """Get the current configuration (loads if not yet loaded)."""
    if _config is None:
        return load_config()
    return _config


def _get_default_config() -> dict:
    """Return default configuration if no JSON file exists."""
    return {
        "satellite": {
            "name": "DISHA-SAT",
            "norad_id": None
        },
        "orbit": {
            "initial_position_eci_km": [7000.0, 0.0, 0.0],
            "initial_velocity_eci_km_s": [0.0, 7.5, 0.0]
        },
        "power": {
            "battery_capacity_wh": 500.0,
            "solar_array_output_w": 18.0,
            "base_load_w": 3.0,
            "bus_voltage_nominal_v": 12.0,
            "solar_panel_current_nominal_a": 1.5,
            "task_loads_w": {
                "IMAGING": 8.0,
                "DOWNLINK": 12.0,
                "MANOEUVRE": 6.0,
                "CONTACT": 10.0
            }
        },
        "thermal": {
            "panel_temp_nominal_c": 25.0,
            "battery_temp_nominal_c": 22.0,
            "panel_warning_high_c": 85.0,
            "panel_warning_low_c": -40.0,
            "panel_critical_high_c": 100.0,
            "panel_critical_low_c": -50.0,
            "battery_warning_high_c": 45.0,
            "battery_warning_low_c": 0.0,
            "battery_critical_high_c": 55.0,
            "battery_critical_low_c": -10.0
        },
        "storage": {
            "capacity_mb": 1048576.0
        },
        "comms": {
            "snr_nominal_db": 15.0,
            "snr_warning_db": 8.0,
            "snr_critical_db": 5.0
        },
        "attitude": {
            "default_mode": "NADIR",
            "pointing_error_limit_deg": 2.0,
            "angular_rate_limit_deg_s": 1.0
        },
        "fdir_rules": [
            {"rule_id": "BATT_CRITICAL", "parameter": "battery_soc", "operator": "<", "threshold": 20, "severity": "CRITICAL", "corrective_action": "Switch to SAFE mode. Disable non-essential loads."},
            {"rule_id": "BATT_LOW", "parameter": "battery_soc", "operator": "<", "threshold": 40, "severity": "WARNING", "corrective_action": "Reduce payload duty cycle. Defer low-priority downlinks."},
            {"rule_id": "TEMP_PANEL_HIGH", "parameter": "component_temp", "operator": ">", "threshold": 85, "severity": "WARNING", "corrective_action": "Adjust attitude to reduce solar exposure."},
            {"rule_id": "TEMP_PANEL_LOW", "parameter": "component_temp", "operator": "<", "threshold": -40, "severity": "WARNING", "corrective_action": "Check thermal control heater status."},
            {"rule_id": "TEMP_BATT_HIGH", "parameter": "battery_temp", "operator": ">", "threshold": 45, "severity": "WARNING", "corrective_action": "Reduce charge rate. Enable battery heater."},
            {"rule_id": "TEMP_BATT_LOW", "parameter": "battery_temp", "operator": "<", "threshold": 0, "severity": "WARNING", "corrective_action": "Enable battery heater."},
            {"rule_id": "STORAGE_HIGH", "parameter": "storage_pct", "operator": ">", "threshold": 90, "severity": "WARNING", "corrective_action": "Prioritize downlink during next ground station pass."},
            {"rule_id": "SNR_LOW", "parameter": "snr", "operator": "<", "threshold": 8, "severity": "WARNING", "corrective_action": "Increase transmit power. Re-point antenna."},
            {"rule_id": "SNR_CRITICAL", "parameter": "snr", "operator": "<", "threshold": 5, "severity": "CRITICAL", "corrective_action": "Switch to backup antenna. Abort data transfer."},
            {"rule_id": "POINTING_ERROR", "parameter": "pointing_error", "operator": ">", "threshold": 2.0, "severity": "WARNING", "corrective_action": "Re-initialize ADCS. Check reaction wheel status."},
            {"rule_id": "ALT_LOW", "parameter": "altitude", "operator": "<", "threshold": 200, "severity": "CRITICAL", "corrective_action": "Evaluate orbit-raising maneuver."}
        ],
        "constraint_rules": [
            {"parameter": "battery_soc", "threshold": 25, "weight": 0.35, "category": "POWER", "operator": "<"},
            {"parameter": "battery_soc", "threshold": 40, "weight": 0.15, "category": "POWER", "operator": "<"},
            {"parameter": "battery_soc", "threshold": 60, "weight": 0.05, "category": "POWER", "operator": "<"},
            {"parameter": "component_temp", "threshold": 75, "weight": 0.10, "category": "THERMAL", "operator": ">"},
            {"parameter": "component_temp", "threshold": -30, "weight": 0.10, "category": "THERMAL", "operator": "<"},
            {"parameter": "battery_temp", "threshold": 40, "weight": 0.10, "category": "THERMAL_BATT", "operator": ">"},
            {"parameter": "battery_temp", "threshold": 5, "weight": 0.08, "category": "THERMAL_BATT", "operator": "<"},
            {"parameter": "link_status", "threshold": "NOMINAL", "weight": 0.30, "category": "COMMS", "operator": "!="},
            {"parameter": "snr", "threshold": 8, "weight": 0.10, "category": "COMMS_SNR", "operator": "<"},
            {"parameter": "snr", "threshold": 5, "weight": 0.20, "category": "COMMS_SNR", "operator": "<"},
            {"parameter": "storage_pct", "threshold": 90, "weight": 0.12, "category": "STORAGE", "operator": ">"},
            {"parameter": "altitude", "threshold": 250, "weight": 0.30, "category": "ORBIT", "operator": "<"}
        ],
        "ground_stations": [
            {"name": "ISTRAC Bangalore", "lat": 12.95, "lon": 77.70, "alt_m": 920, "min_elevation_deg": 5},
            {"name": "ISTRAC Lucknow", "lat": 26.85, "lon": 80.95, "alt_m": 123, "min_elevation_deg": 5},
            {"name": "ISTRAC Sriharikota", "lat": 13.72, "lon": 80.23, "alt_m": 3, "min_elevation_deg": 5},
            {"name": "ISTRAC Thiruvananthapuram", "lat": 8.52, "lon": 76.93, "alt_m": 64, "min_elevation_deg": 5},
            {"name": "ISTRAC Port Blair", "lat": 11.62, "lon": 92.73, "alt_m": 16, "min_elevation_deg": 5},
            {"name": "ISTRAC Mauritius", "lat": -20.10, "lon": 57.55, "alt_m": 422, "min_elevation_deg": 5},
            {"name": "ISTRAC Brunei", "lat": 4.93, "lon": 114.95, "alt_m": 23, "min_elevation_deg": 5},
            {"name": "ISTRAC Biak", "lat": -1.17, "lon": 136.10, "alt_m": 46, "min_elevation_deg": 5}
        ]
    }
