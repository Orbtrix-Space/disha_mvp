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
        ))
    elif batt_pct < 20:
        alerts.append(FDIRAlert(
            alert_id=f"FDIR-{uuid.uuid4().hex[:8]}",
            severity="WARNING",
            code="BATT_LOW",
            message=f"Battery low: {batt_pct:.1f}%",
            timestamp=ts,
            value=batt_pct,
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
        ))

    # Temperature check
    temp_c = frame.get("temperature_c", 25)
    if temp_c < -20 or temp_c > 60:
        alerts.append(FDIRAlert(
            alert_id=f"FDIR-{uuid.uuid4().hex[:8]}",
            severity="WARNING",
            code="THERMAL_RANGE",
            message=f"Temperature out of range: {temp_c:.1f} C",
            timestamp=ts,
            value=temp_c,
        ))

    return alerts
