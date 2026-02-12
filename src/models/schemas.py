from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional

# 1. User Request (What comes IN)
class UserRequest(BaseModel):
    request_id: str
    target_lat: float
    target_lon: float
    priority: int
    window_start: datetime
    window_end: datetime
    min_duration_sec: int = 60
    # Optional: We add this later during processing, so it defaults to None
    feasible_windows: Optional[List[tuple]] = None 

# 2. Task (What goes into the Schedule)
class Task(BaseModel):
    task_id: str
    action: str  # e.g., "IMAGING", "DOWNLINK"
    start_time: datetime
    end_time: datetime
    # --- NEW FIELDS FOR WEEK 3/4 ---
    power_cost_wh: float = 0.0  # Default to 0 if not specified
    data_cost_gb: float = 0.0   # Default to 0 if not specified

# 3. Mission Plan (The Final Output)
class MissionPlan(BaseModel):
    request_id: str
    is_feasible: bool
    reason: str
    schedule: List[Task]