from collections import deque
from datetime import datetime, timezone
from src.core.fdir.rules import check_rules


# Total rules defined in rules.py
RULES_COUNT = 7


class FDIREngine:
    def __init__(self):
        self.alert_history = deque(maxlen=100)
        self.last_evaluation_time = None
        self.auto_actions_today = 0
        self._today_date = None

    def check(self, frame: dict) -> list[dict]:
        alerts = []

        # Deterministic rule-based checks only
        rule_alerts = check_rules(frame)
        for a in rule_alerts:
            alerts.append(a.to_dict())

        for a in alerts:
            self.alert_history.append(a)

        self.last_evaluation_time = datetime.now(timezone.utc)

        # Track auto actions per day
        today = self.last_evaluation_time.date()
        if self._today_date != today:
            self._today_date = today
            self.auto_actions_today = 0
        if alerts:
            self.auto_actions_today += len(alerts)

        return alerts

    def get_history(self) -> list[dict]:
        return list(self.alert_history)

    def get_status(self) -> dict:
        return {
            "active": True,
            "rules_enabled": True,
            "total_alerts": len(self.alert_history),
        }

    def get_summary(self) -> dict:
        """FDIR summary for dashboard display."""
        crit_count = sum(1 for a in self.alert_history if a.get("severity") == "CRITICAL")
        warn_count = sum(1 for a in self.alert_history if a.get("severity") == "WARNING")

        return {
            "rules_active": RULES_COUNT,
            "last_evaluation_time": (
                self.last_evaluation_time.strftime("%H:%M:%S UTC")
                if self.last_evaluation_time else "Not yet evaluated"
            ),
            "total_alerts": len(self.alert_history),
            "critical_count": crit_count,
            "warning_count": warn_count,
            "auto_actions_today": self.auto_actions_today,
            "status": "NOMINAL" if len(self.alert_history) == 0 else (
                "CRITICAL" if crit_count > 0 else "WARNING"
            ),
        }

    def reset(self):
        self.alert_history.clear()
        self.auto_actions_today = 0
        self.last_evaluation_time = None
