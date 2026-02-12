# ==========================================
# RESOURCE CONSUMPTION MODELS
# ==========================================
 
# --- Power Consumption (Watts) ---
# Based on typical CubeSat specs
POWER_IDLE_W = 1.0       # Just staying alive (OBC, Radio receive)
POWER_IMAGING_W = 15.0   # Camera ON, ADCS stabilizing
POWER_DOWNLINK_W = 20.0  # High-gain transmitter ON
 
# --- Data Generation (Gigabits) ---
# High-Res Imager data rate
DATA_RATE_IMAGING_GBPS = 0.5
 
def calculate_energy_cost(mode: str, duration_sec: float) -> float:
    """ 
    Calculates Energy consumed in Watt-hours (Wh).
    Formula: Power (W) * Time (hours)
    """
    hours = duration_sec / 3600.0
    if mode == "IMAGING":
        return POWER_IMAGING_W * hours
    elif mode == "DOWNLINK":
        return POWER_DOWNLINK_W * hours
    else:
        return POWER_IDLE_W * hours
 
def calculate_data_volume(duration_sec: float) -> float:
    """ 
    Calculates Data generated in Gigabits (Gb).
    Formula: Rate (Gbps) * Time (sec)
    """
    return DATA_RATE_IMAGING_GBPS * duration_sec