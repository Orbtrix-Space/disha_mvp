"""
DISHA Beta — Pydantic Schemas
All request/response models for the application.
"""

from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


# ====================================================
# TELEMETRY FRAME (broadcast via WebSocket every tick)
# ====================================================

class PositionData(BaseModel):
    latitude: float
    longitude: float
    altitude: float

class VelocityData(BaseModel):
    speed: float
    vx: float
    vy: float
    vz: float

class PowerData(BaseModel):
    battery_soc: float
    battery_voltage: float
    current_draw: float
    solar_current: float
    in_eclipse: bool

class ThermalData(BaseModel):
    component_temp: float
    heater_active: bool

class CommsData(BaseModel):
    link_status: str  # NOMINAL | DEGRADED | LOST
    snr: float
    data_rate: float
    nearest_station: str

class AttitudeData(BaseModel):
    mode: str  # NADIR | SUN_POINTING | TARGET
    pointing_error: float
    angular_rate: float

class StorageData(BaseModel):
    used_mb: float
    capacity_mb: float
    storage_pct: float

class FDIRAlertModel(BaseModel):
    rule_id: str
    severity: str  # WARNING | CRITICAL
    parameter: str
    current_value: float
    threshold: float
    timestamp: str
    corrective_action: str

class TelemetryFrame(BaseModel):
    timestamp: str
    position: PositionData
    velocity: VelocityData
    power: PowerData
    thermal: ThermalData
    comms: CommsData
    attitude: AttitudeData
    storage: StorageData
    fdir_alerts: List[FDIRAlertModel]


# ====================================================
# TASK DEFINITION
# ====================================================

class TaskDefinition(BaseModel):
    name: str
    type: str  # IMAGING | DOWNLINK | MANOEUVRE | CONTACT
    priority: int = 5
    start_window: Optional[str] = None
    end_window: Optional[str] = None
    duration_seconds: int = 300
    power_draw_watts: float = 10.0
    requires_sunlit: bool = False
    requires_ground_contact: bool = False


# ====================================================
# AUTONOMY STATUS
# ====================================================

class AutonomyStatus(BaseModel):
    mode: str  # AUTONOMOUS | GUARDED | SAFE
    current_objective: str
    last_decision: str
    last_decision_time: str
    risk_score: float
    confidence: float
    override_active: bool


# ====================================================
# LEGACY COMPATIBLE SCHEMAS
# ====================================================

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
    action: str  # IMAGING | DOWNLINK | MANOEUVRE | CONTACT
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
    epoch_age_hours: Optional[float] = None


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


class Telecommand(BaseModel):
    command_id: str
    task_id: str
    command_type: str
    description: str = ""
    parameters: dict = {}
    scheduled_time: str = ""
    status: str = "PENDING"


class CommandSequence(BaseModel):
    sequence_id: str
    plan_id: str
    commands: List[Telecommand]
    total_commands: int
    created_at: str
    approved: bool = False
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None


class PowerPredictionPoint(BaseModel):
    time_offset_min: float
    soc_pct: float
    in_eclipse: bool
    solar_generation_w: float
    load_consumption_w: float


class PowerPrediction(BaseModel):
    prediction_points: List[PowerPredictionPoint]
    min_soc_pct: float
    power_margin_wh: float


class ScheduleRequest(BaseModel):
    requests: list[dict]
