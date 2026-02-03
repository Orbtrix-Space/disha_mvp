from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

# 1. The Request (What comes IN)
@dataclass
class UserRequest: 
    request_id: str
    target_lat: float
    target_lon: float
    priority: int           # 1 (Low) to 10 (Critical)
    
    # --- ADDED THESE TWO FIELDS ---
    window_start: datetime  # "Don't look before this time"
    window_end: datetime    # "Must be done by this time"
    # ------------------------------

    min_duration_sec: int = 60  

# 2. The Plan (What goes OUT)
@dataclass
class Task:
    task_id: str
    action: str             # "IMAGING", "DOWNLINK", "SLEW"
    start_time: datetime
    end_time: datetime
    power_cost_wh: float
    data_cost_gb: float 

@dataclass
class MissionPlan:
    request_id: str
    is_feasible: bool
    reason: str             # "SUCCESS" or "ERR_BATTERY_LOW"
    schedule: List[Task]