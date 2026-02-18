from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class UserRequest(BaseModel):
    request_id: str
    target_lat: float
    target_lon: float
    priority: int
    window_start: datetime
    window_end: datetime
    min_duration_sec: int = 60
    feasible_windows: Optional[List[tuple]] = None


class Task(BaseModel):
    task_id: str
    action: str
    start_time: datetime
    end_time: datetime
    power_cost_wh: float = 0.0
    data_cost_gb: float = 0.0


class MissionPlan(BaseModel):
    request_id: str
    is_feasible: bool
    reason: str
    schedule: List[Task]


class TLELoadRequest(BaseModel):
    norad_id: int


class TLEInfo(BaseModel):
    norad_id: Optional[int] = None
    satellite_name: str = ""
    tle_line1: str = ""
    tle_line2: str = ""
    loaded: bool = False


class TelemetryFrame(BaseModel):
    timestamp: str
    position_eci: List[float]
    velocity_eci: List[float]
    altitude_km: float
    speed_km_s: float
    latitude: float
    longitude: float
    battery_wh: float
    battery_pct: float
    storage_used_gb: float
    storage_pct: float
    max_battery_wh: float
    max_storage_gb: float
    temperature_c: float
    attitude_quaternion: List[float]
    solar_panel_current_a: float
    mode: str


class FDIRAlertModel(BaseModel):
    alert_id: str
    severity: str
    code: str
    message: str
    timestamp: str
    value: float


class RelNavRequest(BaseModel):
    primary_state: dict
    secondary_state: dict


class OrbitalElements(BaseModel):
    semi_major_axis_km: float
    eccentricity: float
    inclination_deg: float
    raan_deg: float
    arg_periapsis_deg: float
    true_anomaly_deg: float
    period_min: float


class GroundStationPass(BaseModel):
    station_name: str
    latitude: float
    longitude: float
    country: str
    aos_time: str
    los_time: str
    duration_sec: float
    max_elevation_deg: float


class ConjunctionEvent(BaseModel):
    object_name: str
    norad_id: int
    tca_hours_ahead: int
    miss_distance_km: float
    collision_probability: float
    status: str
