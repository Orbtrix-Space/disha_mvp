"""
Autonomy Manager for DISHA MVP.
Evaluates telemetry to compute autonomy state: mode, objective, risk, confidence.
Rule-based, deterministic. No ML.
"""

from datetime import datetime, timezone


class AutonomyManager:
    """
    Maintains autonomy state based on telemetry snapshots.
    Call evaluate() each tick to update state.
    """

    def __init__(self):
        self.mode = "AUTONOMOUS"
        self.current_objective = "Nominal Orbit Maintenance"
        self.last_decision = "System initialized"
        self.last_decision_time = datetime.now(timezone.utc).isoformat()
        self.risk_score = 0.0
        self.confidence = 1.0
        self.decisions_log = []

    def evaluate(self, telemetry: dict, constraint_result: dict = None,
                 upcoming_tasks: list = None) -> dict:
        """
        Evaluate autonomy state from current telemetry.

        Args:
            telemetry: current telemetry frame
            constraint_result: output from constraint_engine.evaluate_constraints()
            upcoming_tasks: list of tasks starting within next 10 min (optional)

        Returns: autonomy status dict
        """
        battery_pct = telemetry.get("battery_pct", 100)
        solar_current = telemetry.get("solar_panel_current_a", 1.5)
        link_status = telemetry.get("link_status", "NOMINAL")
        storage_pct = telemetry.get("storage_pct", 0)

        # Risk score from constraint engine or compute basic one
        if constraint_result:
            self.risk_score = constraint_result.get("risk_score", 0.0)
        else:
            self.risk_score = self._compute_basic_risk(battery_pct, solar_current,
                                                        link_status, storage_pct)

        self.confidence = round(1.0 - self.risk_score, 3)

        # Determine objective
        prev_objective = self.current_objective
        self.current_objective = self._determine_objective(
            battery_pct, solar_current, link_status, storage_pct, upcoming_tasks
        )

        # Determine mode
        if self.risk_score > 0.6:
            self.mode = "SAFE"
        elif self.risk_score > 0.3:
            self.mode = "GUARDED"
        else:
            self.mode = "AUTONOMOUS"

        # Log decision if objective changed
        if self.current_objective != prev_objective:
            decision = self._generate_decision(prev_objective, battery_pct,
                                                solar_current, link_status, storage_pct)
            self.last_decision = decision
            self.last_decision_time = datetime.now(timezone.utc).isoformat()
            self.decisions_log.append({
                "time": self.last_decision_time,
                "decision": decision,
                "from": prev_objective,
                "to": self.current_objective,
                "risk": self.risk_score,
            })
            # Keep log bounded
            if len(self.decisions_log) > 50:
                self.decisions_log = self.decisions_log[-50:]

        return self.get_status()

    def get_status(self) -> dict:
        return {
            "mode": self.mode,
            "current_objective": self.current_objective,
            "last_decision": self.last_decision,
            "last_decision_time": self.last_decision_time,
            "risk_score": round(self.risk_score, 3),
            "confidence": round(self.confidence, 3),
            "auto_decisions_count": len(self.decisions_log),
        }

    def get_decisions_log(self) -> list:
        return list(self.decisions_log)

    def reset(self):
        self.__init__()

    def _compute_basic_risk(self, battery_pct, solar_current, link_status, storage_pct):
        risk = 0.0
        if battery_pct < 25:
            risk += 0.35
        elif battery_pct < 40:
            risk += 0.15
        if solar_current < 0.3:
            risk += 0.15
        if link_status != "NOMINAL":
            risk += 0.25
        if storage_pct > 90:
            risk += 0.10
        return round(min(1.0, risk), 3)

    def _determine_objective(self, battery_pct, solar_current, link_status,
                             storage_pct, upcoming_tasks):
        # Priority 1: Critical power
        if battery_pct < 30:
            return "Power Recovery Mode"

        # Priority 2: Comms degraded
        if link_status != "NOMINAL":
            return "Communication Recovery"

        # Priority 3: Storage critical
        if storage_pct > 90:
            return "Data Offload Priority"

        # Priority 4: Upcoming task
        if upcoming_tasks and len(upcoming_tasks) > 0:
            return "Target Tracking"

        # Priority 5: Low solar (in eclipse)
        if solar_current < 0.2:
            return "Eclipse Power Conservation"

        return "Nominal Orbit Maintenance"

    def _generate_decision(self, prev_objective, battery_pct, solar_current,
                           link_status, storage_pct):
        obj = self.current_objective
        if obj == "Power Recovery Mode":
            return f"Payload deferred due to low power margin ({battery_pct:.0f}%)"
        elif obj == "Communication Recovery":
            return f"Switching to comm recovery — link status: {link_status}"
        elif obj == "Data Offload Priority":
            return f"Prioritizing downlink — storage at {storage_pct:.0f}%"
        elif obj == "Target Tracking":
            return "Aligning for upcoming scheduled task"
        elif obj == "Eclipse Power Conservation":
            return f"Entering eclipse conservation — solar current: {solar_current:.2f}A"
        elif obj == "Nominal Orbit Maintenance":
            return f"Returned to nominal operations from {prev_objective}"
        return "Objective updated"
