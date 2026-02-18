from collections import deque
from datetime import datetime, timezone
import uuid
from src.core.fdir.rules import check_rules
from src.core.fdir.anomaly_detector import AnomalyDetector


class FDIREngine:
    def __init__(self):
        self.anomaly_detector = AnomalyDetector()
        self.alert_history = deque(maxlen=100)

    def check(self, frame: dict) -> list[dict]:
        alerts = []

        # Layer 1: Rule-based thresholds
        rule_alerts = check_rules(frame)
        for a in rule_alerts:
            alerts.append(a.to_dict())

        # Layer 2: ML anomaly detection
        is_anomaly = self.anomaly_detector.add_frame(frame)
        if is_anomaly:
            alerts.append({
                "alert_id": f"FDIR-ML-{uuid.uuid4().hex[:8]}",
                "severity": "WARNING",
                "code": "ANOMALY_DETECTED",
                "message": "ML model detected anomalous telemetry pattern",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "value": 0,
            })

        for a in alerts:
            self.alert_history.append(a)

        return alerts

    def get_history(self) -> list[dict]:
        return list(self.alert_history)

    def get_status(self) -> dict:
        return {
            "active": True,
            "rules_enabled": True,
            "ml_enabled": True,
            "ml_trained": self.anomaly_detector.is_trained(),
            "samples_collected": len(self.anomaly_detector.buffer),
            "total_alerts": len(self.alert_history),
        }

    def reset(self):
        self.anomaly_detector.reset()
        self.alert_history.clear()
