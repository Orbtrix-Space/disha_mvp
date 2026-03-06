"""
DISHA Beta — Autonomy Manager
Three-mode state machine, objective selection, decision logging, operator override.
Deterministic, rule-based only. No ML.
"""

from datetime import datetime, timezone


class AutonomyManager:
    def __init__(self):
        self.mode = "AUTONOMOUS"
        self.current_objective = "Nominal Orbit Maintenance"
        self.last_decision = "System initialized"
        self.last_decision_time = datetime.now(timezone.utc).isoformat()
        self.risk_score = 0.0
        self.confidence = 1.0
        self.decisions_log = []
        self.override_active = False
        self._override_mode = None

    def evaluate(self, telemetry: dict, constraint_result: dict = None,
                 upcoming_tasks: list = None) -> dict:
        """
        Evaluate autonomy state from current telemetry and constraint results.
        Returns autonomy status dict.
        """
        battery_soc = telemetry.get("battery_pct", telemetry.get("battery_soc", 100))
        solar_current = telemetry.get("solar_panel_current_a", telemetry.get("solar_current", 1.5))
        link_status = telemetry.get("link_status", "NOMINAL")
        storage_pct = telemetry.get("storage_pct", 0)

        # Risk score from constraint engine
        if constraint_result:
            self.risk_score = constraint_result.get("risk_score", 0.0)
        else:
            self.risk_score = self._compute_basic_risk(battery_soc, solar_current,
                                                        link_status, storage_pct)

        # Confidence = 1.0 - risk_score
        self.confidence = round(1.0 - self.risk_score, 3)

        # Determine objective (priority cascade)
        prev_objective = self.current_objective
        self.current_objective = self._determine_objective(
            battery_soc, solar_current, link_status, storage_pct, upcoming_tasks
        )

        # Mode transitions based on risk score (unless operator override)
        if not self.override_active:
            if self.risk_score > 0.6:
                self.mode = "SAFE"
            elif self.risk_score > 0.3:
                self.mode = "GUARDED"
            else:
                self.mode = "AUTONOMOUS"

        # Log decision if objective changed
        if self.current_objective != prev_objective:
            decision = self._generate_decision(prev_objective, battery_soc,
                                                solar_current, link_status, storage_pct)
            self.last_decision = decision
            self.last_decision_time = datetime.now(timezone.utc).isoformat()
            self.decisions_log.append({
                "time": self.last_decision_time,
                "decision": decision,
                "from": prev_objective,
                "to": self.current_objective,
                "risk": self.risk_score,
                "mode": self.mode,
            })
            # Keep log bounded at 50 entries (FIFO)
            if len(self.decisions_log) > 50:
                self.decisions_log = self.decisions_log[-50:]

        return self.get_status()

    def set_mode(self, mode: str, operator: str = "OPERATOR") -> dict:
        """Operator override: force specific mode, bypass risk-based logic."""
        if mode not in ("AUTONOMOUS", "GUARDED", "SAFE"):
            return {"status": "ERROR", "message": f"Invalid mode: {mode}"}

        self.override_active = True
        self._override_mode = mode
        self.mode = mode

        decision = f"Operator override: mode set to {mode} by {operator}"
        self.last_decision = decision
        self.last_decision_time = datetime.now(timezone.utc).isoformat()
        self.decisions_log.append({
            "time": self.last_decision_time,
            "decision": decision,
            "from": self.mode,
            "to": mode,
            "risk": self.risk_score,
            "mode": mode,
            "override": True,
        })

        return {"status": "OK", "mode": mode, "override_active": True}

    def release_override(self) -> dict:
        """Release operator override, resume automatic mode selection."""
        self.override_active = False
        self._override_mode = None

        decision = "Operator override released. Resuming automatic mode selection."
        self.last_decision = decision
        self.last_decision_time = datetime.now(timezone.utc).isoformat()
        self.decisions_log.append({
            "time": self.last_decision_time,
            "decision": decision,
            "from": self.mode,
            "to": "AUTO",
            "risk": self.risk_score,
            "mode": self.mode,
            "override": False,
        })

        return {"status": "OK", "override_active": False}

    def get_status(self) -> dict:
        return {
            "mode": self.mode,
            "current_objective": self.current_objective,
            "last_decision": self.last_decision,
            "last_decision_time": self.last_decision_time,
            "risk_score": round(self.risk_score, 3),
            "confidence": round(self.confidence, 3),
            "override_active": self.override_active,
            "auto_decisions_count": len(self.decisions_log),
        }

    def get_decisions_log(self) -> list:
        return list(self.decisions_log)

    def reset(self):
        self.__init__()

    def _compute_basic_risk(self, battery_soc, solar_current, link_status, storage_pct):
        risk = 0.0
        if battery_soc < 25:
            risk += 0.35
        elif battery_soc < 40:
            risk += 0.15
        if solar_current < 0.3:
            risk += 0.15
        if link_status != "NOMINAL":
            risk += 0.25
        if storage_pct > 90:
            risk += 0.10
        return round(min(1.0, risk), 3)

    def _determine_objective(self, battery_soc, solar_current, link_status,
                             storage_pct, upcoming_tasks):
        """Priority cascade of if-else for objective selection."""
        # Priority 1: Power recovery
        if battery_soc < 30:
            return "Power Recovery Mode"
        # Priority 2: Communication recovery
        if link_status != "NOMINAL":
            return "Communication Recovery"
        # Priority 3: Data offload
        if storage_pct > 90:
            return "Data Offload Priority"
        # Priority 4: Target tracking
        if upcoming_tasks and len(upcoming_tasks) > 0:
            return "Target Tracking"
        # Priority 5: Eclipse power conservation
        if solar_current < 0.2:
            return "Eclipse Power Conservation"
        # Priority 6: Nominal
        return "Nominal Orbit Maintenance"

    def _generate_decision(self, prev_objective, battery_soc, solar_current,
                           link_status, storage_pct):
        """Generate human-readable decision string."""
        obj = self.current_objective
        if obj == "Power Recovery Mode":
            return f"Payload deferred due to low power margin at {battery_soc:.0f}%"
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
