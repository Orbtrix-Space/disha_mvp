"""
DISHA Beta — FDIR Engine
Configurable rule evaluation, alert generation, self-clearing alert lifecycle.
Deterministic, rule-based only. No ML.
"""

import uuid
from collections import deque
from datetime import datetime, timezone
from backend.models.config import get_config


class FDIRAlert:
    """Single FDIR alert with all metadata."""
    def __init__(self, rule_id: str, severity: str, parameter: str,
                 current_value: float, threshold: float, corrective_action: str):
        self.rule_id = rule_id
        self.severity = severity
        self.parameter = parameter
        self.current_value = current_value
        self.threshold = threshold
        self.timestamp = datetime.now(timezone.utc).isoformat()
        self.corrective_action = corrective_action

    def to_dict(self) -> dict:
        return {
            "rule_id": self.rule_id,
            "severity": self.severity,
            "parameter": self.parameter,
            "current_value": self.current_value,
            "threshold": self.threshold,
            "timestamp": self.timestamp,
            "corrective_action": self.corrective_action,
            # Legacy compatibility
            "alert_id": f"FDIR-{self.rule_id}",
            "code": self.rule_id,
            "message": f"{self.parameter} {'below' if self.current_value < self.threshold else 'above'} threshold: {self.current_value}",
            "value": self.current_value,
        }


# Default FDIR rules (used if config not available)
DEFAULT_RULES = [
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
    {"rule_id": "ALT_LOW", "parameter": "altitude", "operator": "<", "threshold": 200, "severity": "CRITICAL", "corrective_action": "Evaluate orbit-raising maneuver."},
]


class FDIREngine:
    def __init__(self):
        config = get_config()
        self.rules = config.get("fdir_rules", DEFAULT_RULES)
        self.active_alerts = {}  # keyed by rule_id — self-clearing
        self.alert_history = deque(maxlen=200)
        self.last_evaluation_time = None
        self.auto_actions_today = 0
        self._today_date = None

    def evaluate(self, telemetry: dict) -> list:
        """
        Evaluate all rules against current telemetry.
        Self-clearing: alerts added when triggered, removed when condition clears.
        Returns list of currently active alert dicts.
        """
        newly_triggered = {}

        for rule in self.rules:
            rule_id = rule["rule_id"]
            param = rule["parameter"]
            op = rule["operator"]
            threshold = rule["threshold"]
            severity = rule["severity"]
            action = rule["corrective_action"]

            # Skip comms rules during blackout — SNR=0 is expected when not in contact
            if param == "snr" and not telemetry.get("in_contact", True):
                continue

            # Map parameter names to telemetry fields
            value = self._get_value(telemetry, param)
            if value is None:
                continue

            triggered = False
            if op == "<" and isinstance(value, (int, float)):
                triggered = value < threshold
            elif op == ">" and isinstance(value, (int, float)):
                triggered = value > threshold
            elif op == "!=" :
                triggered = value != threshold
            elif op == "==":
                triggered = value == threshold

            if triggered:
                newly_triggered[rule_id] = FDIRAlert(
                    rule_id=rule_id,
                    severity=severity,
                    parameter=param,
                    current_value=float(value) if isinstance(value, (int, float)) else 0,
                    threshold=float(threshold) if isinstance(threshold, (int, float)) else 0,
                    corrective_action=action,
                )

        # Self-clearing: add new alerts, remove cleared ones
        new_alerts = []
        for rule_id, alert in newly_triggered.items():
            if rule_id not in self.active_alerts:
                # New alert
                self.active_alerts[rule_id] = alert
                alert_dict = alert.to_dict()
                self.alert_history.append(alert_dict)
                new_alerts.append(alert_dict)

        # Clear alerts where condition has returned to normal
        cleared = [rid for rid in self.active_alerts if rid not in newly_triggered]
        for rid in cleared:
            del self.active_alerts[rid]

        self.last_evaluation_time = datetime.now(timezone.utc)

        # Track daily auto actions
        today = self.last_evaluation_time.date()
        if self._today_date != today:
            self._today_date = today
            self.auto_actions_today = 0
        if new_alerts:
            self.auto_actions_today += len(new_alerts)

        return [a.to_dict() for a in self.active_alerts.values()]

    # Legacy compatibility
    def check(self, frame: dict) -> list:
        return self.evaluate(frame)

    def _get_value(self, telemetry: dict, param: str):
        """Get telemetry value, trying multiple field name conventions."""
        # Direct match
        if param in telemetry:
            return telemetry[param]
        # Map param names to common telemetry field names
        mappings = {
            "battery_soc": ["battery_pct", "battery_soc"],
            "component_temp": ["panel_temp_c", "component_temp"],
            "battery_temp": ["battery_temp_c", "battery_temp"],
            "snr": ["snr_db", "snr"],
            "storage_pct": ["storage_pct"],
            "altitude": ["altitude_km"],
            "pointing_error": ["pointing_error"],
        }
        for alt in mappings.get(param, []):
            if alt in telemetry:
                return telemetry[alt]
        return None

    def get_active_alerts(self) -> list:
        """Return currently active alerts."""
        return [a.to_dict() for a in self.active_alerts.values()]

    def get_history(self) -> list:
        """Return full alert history."""
        return list(self.alert_history)

    def get_status(self) -> dict:
        """Return FDIR engine operational status."""
        return {
            "active": True,
            "rules_enabled": True,
            "rules_count": len(self.rules),
            "active_alerts": len(self.active_alerts),
            "total_alerts": len(self.alert_history),
        }

    def get_summary(self) -> dict:
        """Summary statistics for dashboard display."""
        active_list = self.get_active_alerts()
        crit_count = sum(1 for a in active_list if a.get("severity") == "CRITICAL")
        warn_count = sum(1 for a in active_list if a.get("severity") == "WARNING")

        if crit_count > 0:
            risk_status = "CRITICAL"
        elif warn_count > 0:
            risk_status = "WARNING"
        else:
            risk_status = "NOMINAL"

        return {
            "rules_active": len(self.rules),
            "last_evaluation_time": (
                self.last_evaluation_time.strftime("%H:%M:%S UTC")
                if self.last_evaluation_time else "Not yet evaluated"
            ),
            "active_alerts": len(self.active_alerts),
            "total_alerts_history": len(self.alert_history),
            "critical_count": crit_count,
            "warning_count": warn_count,
            "auto_actions_today": self.auto_actions_today,
            "risk_status": risk_status,
            "status": risk_status,
        }

    def reset(self):
        """Clear all alerts and history."""
        self.active_alerts.clear()
        self.alert_history.clear()
        self.auto_actions_today = 0
        self.last_evaluation_time = None
