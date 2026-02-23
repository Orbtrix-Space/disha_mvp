from dataclasses import dataclass, asdict
from datetime import datetime, timezone
import uuid


@dataclass
class FDIRAlert:
    alert_id: str
    severity: str
    code: str
    message: str
    timestamp: str
    value: float
    corrective_action: str

    def to_dict(self):
        return asdict(self)


def check_rules(frame: dict) -> list[FDIRAlert]:
    alerts = []
    ts = frame.get("timestamp", datetime.now(timezone.utc).isoformat())

    # Battery checks
    batt_pct = frame.get("battery_pct", 100)
    if batt_pct < 10:
        alerts.append(FDIRAlert(
            alert_id=f"FDIR-{uuid.uuid4().hex[:8]}",
            severity="CRITICAL",
            code="BATT_CRITICAL",
            message=f"Battery critically low: {batt_pct:.1f}%",
            timestamp=ts,
            value=batt_pct,
            corrective_action="Switch to SAFE mode. Disable non-essential loads. Cancel pending imaging tasks.",
        ))
    elif batt_pct < 20:
        alerts.append(FDIRAlert(
            alert_id=f"FDIR-{uuid.uuid4().hex[:8]}",
            severity="WARNING",
            code="BATT_LOW",
            message=f"Battery low: {batt_pct:.1f}%",
            timestamp=ts,
            value=batt_pct,
            corrective_action="Reduce payload duty cycle. Defer low-priority downlinks until next sunlit pass.",
        ))

    # Storage check
    storage_pct = frame.get("storage_pct", 0)
    if storage_pct > 90:
        alerts.append(FDIRAlert(
            alert_id=f"FDIR-{uuid.uuid4().hex[:8]}",
            severity="WARNING",
            code="STORAGE_FULL",
            message=f"Storage nearly full: {storage_pct:.1f}%",
            timestamp=ts,
            value=storage_pct,
            corrective_action="Prioritize downlink during next ground station pass. Consider purging low-priority data.",
        ))

    # Altitude check
    alt_km = frame.get("altitude_km", 600)
    if alt_km < 200:
        alerts.append(FDIRAlert(
            alert_id=f"FDIR-{uuid.uuid4().hex[:8]}",
            severity="CRITICAL",
            code="ALT_LOW",
            message=f"Altitude dangerously low: {alt_km:.1f} km",
            timestamp=ts,
            value=alt_km,
            corrective_action="Evaluate orbit-raising maneuver. Prepare contingency deorbit plan.",
        ))

    # Thermal - Solar panel
    panel_temp = frame.get("panel_temp_c", 25)
    if panel_temp < -40 or panel_temp > 85:
        alerts.append(FDIRAlert(
            alert_id=f"FDIR-{uuid.uuid4().hex[:8]}",
            severity="WARNING",
            code="THERMAL_PANEL",
            message=f"Solar panel temperature out of range: {panel_temp:.1f} C",
            timestamp=ts,
            value=panel_temp,
            corrective_action="Adjust attitude to reduce solar exposure. Check thermal control heater status.",
        ))

    # Thermal - Battery
    battery_temp = frame.get("battery_temp_c", 22)
    if battery_temp < 0 or battery_temp > 45:
        alerts.append(FDIRAlert(
            alert_id=f"FDIR-{uuid.uuid4().hex[:8]}",
            severity="WARNING",
            code="THERMAL_BATTERY",
            message=f"Battery temperature out of range: {battery_temp:.1f} C",
            timestamp=ts,
            value=battery_temp,
            corrective_action="Enable battery heater or reduce charge rate. Switch to thermal safe mode if persists.",
        ))

    # Comms check
    snr = frame.get("snr_db", 15)
    if snr < 5:
        alerts.append(FDIRAlert(
            alert_id=f"FDIR-{uuid.uuid4().hex[:8]}",
            severity="WARNING",
            code="COMMS_DEGRADED",
            message=f"Signal-to-noise ratio degraded: {snr:.1f} dB",
            timestamp=ts,
            value=snr,
            corrective_action="Increase transmit power. Re-point antenna. Defer data transfer until signal improves.",
        ))

    return alerts
