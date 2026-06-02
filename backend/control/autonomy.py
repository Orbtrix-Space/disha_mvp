"""
DISHA Beta — Mission-Grade Autonomy Manager
Deterministic, constraint-driven, explainable autonomy layer.

Architecture:
- Three-mode state machine (AUTONOMOUS / GUARDED / SAFE) with hysteresis
- Configurable objective rules loaded from config (no hardcoded policies)
- Structured decision objects with full traceability
- Feasibility validation layer
- Temporal awareness (short-term predictions)
- Subsystem coupling model
- Operator override with duration tracking

No ML. Every decision is traceable and explainable.
"""

from datetime import datetime, timezone
from collections import deque

from backend.shared.models.config import get_config


VALID_MODES = ("AUTONOMOUS", "GUARDED", "SAFE")

# Condition operators for objective rule evaluation
CONDITION_OPS = {
    "lt": lambda val, thr: isinstance(val, (int, float)) and val < thr,
    "gt": lambda val, thr: isinstance(val, (int, float)) and val > thr,
    "eq": lambda val, thr: val == thr,
    "neq": lambda val, thr: val != thr,
    "lte": lambda val, thr: isinstance(val, (int, float)) and val <= thr,
    "gte": lambda val, thr: isinstance(val, (int, float)) and val >= thr,
}

# Field name mappings for telemetry flexibility
FIELD_MAPPINGS = {
    "battery_soc": ["battery_pct", "battery_soc"],
    "solar_current": ["solar_panel_current_a", "solar_current"],
    "link_status": ["link_status"],
    "storage_pct": ["storage_pct"],
    "component_temp": ["panel_temp_c", "component_temp"],
    "battery_temp": ["battery_temp_c", "battery_temp"],
    "snr": ["snr_db", "snr"],
    "altitude": ["altitude_km", "altitude"],
    "bus_voltage": ["bus_voltage", "bus_voltage_v"],
    "pointing_error": ["pointing_error"],
    "in_eclipse": ["in_eclipse"],
}


def _get_tel(telemetry: dict, param: str, default=None):
    """Get telemetry value by parameter name, trying multiple field names."""
    if param in telemetry:
        return telemetry[param]
    for alt in FIELD_MAPPINGS.get(param, []):
        if alt in telemetry:
            return telemetry[alt]
    return default


class AutonomyManager:
    """Mission-grade autonomy manager with deterministic, configurable decision logic."""

    def __init__(self):
        self._load_config()
        self.mode = "AUTONOMOUS"
        self.previous_mode = "AUTONOMOUS"
        self.current_objective = None
        self.previous_objective = None
        self.risk_score = 0.0
        self.anomaly_score = 0.0
        self.combined_risk_score = 0.0
        self.ai_flagged_subsystems = []
        self.ai_confidence = "unavailable"
        self.confidence_level = "HIGH"
        self.confidence_score = 1.0

        # Hysteresis state
        self._mode_entered_at = datetime.now(timezone.utc)
        self._pending_mode = None
        self._pending_mode_since = None

        # Decision state
        self.last_decision = self._make_init_decision()
        self.decisions_log = deque(maxlen=self._max_log)

        # Override state
        self.override_active = False
        self._override_mode = None
        self._override_operator = None
        self._override_reason = None
        self._override_started_at = None

        # Feasibility cache
        self._last_feasibility = {}

        # Prediction state
        self._prediction_cache = {}

        # Subsystem coupling state
        self._coupling_state = {}

    def _load_config(self):
        """Load autonomy configuration from satellite config."""
        config = get_config()
        auto_cfg = config.get("autonomy", {})

        self._mode_thresholds = auto_cfg.get("mode_thresholds", {
            "safe_enter": 0.6, "safe_exit": 0.5,
            "guarded_enter": 0.3, "guarded_exit": 0.2,
        })
        self._min_dwell_sec = auto_cfg.get("min_dwell_time_sec", 30)
        self._max_log = auto_cfg.get("max_decisions_log", 100)
        self._objective_rules = auto_cfg.get("objective_rules", [])
        self._objective_rules.sort(key=lambda r: r.get("priority", 99))
        self._feasibility_cfg = auto_cfg.get("feasibility", {})
        self._coupling_cfg = auto_cfg.get("subsystem_coupling", {})
        self._confidence_cfg = auto_cfg.get("confidence_levels", {
            "high_threshold": 0.8, "medium_threshold": 0.5,
        })
        self._prediction_horizon = auto_cfg.get("prediction_horizon_sec", 600)

        # AI monitor blending (rules + AI). AI can only escalate risk,
        # never de-escalate. Rules remain the deterministic safety backstop.
        ai_cfg = auto_cfg.get("ai_monitor", {})
        self.ai_weight = float(ai_cfg.get("weight", 0.3))
        self.ai_min_anomaly = float(ai_cfg.get("min_anomaly_for_escalation", 0.4))

    def _make_init_decision(self):
        """Create the initialization decision object."""
        return {
            "action": "initialize",
            "reason": "Autonomy manager initialized",
            "trigger_constraints": [],
            "priority": "LOW",
            "expected_outcome": "System ready for autonomous operations",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "from_objective": None,
            "to_objective": "Nominal Orbit Maintenance",
            "from_mode": "AUTONOMOUS",
            "to_mode": "AUTONOMOUS",
            "risk_score": 0.0,
            "confidence_level": "HIGH",
            "feasibility": {},
        }

    # ─── Main Evaluation ─────────────────────────────────────────

    def evaluate(self, telemetry: dict, constraint_result: dict = None,
                 ai_result: dict = None, upcoming_tasks: list = None,
                 predictions: dict = None) -> dict:
        """
        Evaluate autonomy state from telemetry, constraints, AI monitor,
        tasks, and predictions.

        Parameters:
            telemetry: Current telemetry snapshot
            constraint_result: Output from rule-based constraint engine
            ai_result: Output from the AI anomaly monitor (anomaly_score,
                flagged_subsystems, reconstruction_errors, confidence).
                Optional — when absent or model_loaded=False the manager
                falls back to pure rule-based behavior.
            upcoming_tasks: List of scheduled tasks in the near future
            predictions: Short-term predictions (power trends, contacts, eclipse)

        Returns: Full autonomy status dict
        """
        now = datetime.now(timezone.utc)

        # Extract constraint data
        if constraint_result:
            self.risk_score = constraint_result.get("risk_score", 0.0)
            violations = constraint_result.get("violations", [])
            margins = constraint_result.get("margins", {})
            recommended_mode = constraint_result.get("recommended_mode", None)
        else:
            self.risk_score = 0.0
            violations = []
            margins = {}
            recommended_mode = None

        # Extract AI monitor result (early-warning augmentation).
        # AI is allowed to escalate the effective risk but never lower it.
        if ai_result and isinstance(ai_result, dict):
            self.anomaly_score = float(ai_result.get("anomaly_score", 0.0) or 0.0)
            self.ai_flagged_subsystems = list(ai_result.get("flagged_subsystems") or [])
            self.ai_confidence = ai_result.get("confidence", "unavailable")
        else:
            self.anomaly_score = 0.0
            self.ai_flagged_subsystems = []
            self.ai_confidence = "unavailable"

        ai_lift = (self.anomaly_score * self.ai_weight
                   if self.anomaly_score >= self.ai_min_anomaly else 0.0)
        self.combined_risk_score = round(
            min(1.0, max(self.risk_score, self.risk_score + ai_lift)), 3
        )

        # Compute confidence level (not just 1-risk)
        self.confidence_level, self.confidence_score = self._compute_confidence(
            self.risk_score, violations, margins, telemetry
        )

        # Compute subsystem coupling effects
        coupling_effects = self._evaluate_coupling(telemetry, margins)

        # Check feasibility of potential objectives
        feasibility = self._evaluate_feasibility(telemetry, margins, predictions)
        self._last_feasibility = feasibility

        # Evaluate temporal predictions
        temporal_context = self._evaluate_temporal(
            telemetry, predictions, upcoming_tasks
        )

        # Select objective via configurable rules
        self.previous_objective = self.current_objective
        selected_objective, trigger_constraints, rejected_objectives = (
            self._select_objective(
                telemetry, violations, upcoming_tasks,
                feasibility, coupling_effects, temporal_context
            )
        )
        self.current_objective = selected_objective

        # Mode transition with hysteresis — uses combined risk so AI flags
        # can escalate mode, but rule-based recommended_mode is preserved
        # as the deterministic floor.
        if not self.override_active:
            self._transition_mode(
                self.combined_risk_score, recommended_mode, now
            )

        # Generate structured decision if state changed
        objective_changed = self.current_objective != self.previous_objective
        mode_changed = self.mode != self.previous_mode

        if objective_changed or mode_changed:
            decision = self._build_decision(
                trigger_constraints=trigger_constraints,
                coupling_effects=coupling_effects,
                temporal_context=temporal_context,
                feasibility=feasibility,
                rejected_objectives=rejected_objectives,
            )
            self.last_decision = decision
            self.decisions_log.append(decision)

        self.previous_mode = self.mode

        return self.get_status()

    # ─── Confidence Computation ───────────────────────────────────

    def _compute_confidence(self, risk_score, violations, margins, telemetry):
        """
        Compute confidence level based on multiple factors, not just risk score.
        Returns (level_str, score_float).
        """
        score = 1.0

        # Factor 1: Risk score impact (weight 0.4)
        score -= risk_score * 0.4

        # Factor 2: Number of violations (weight 0.2)
        if len(violations) >= 3:
            score -= 0.2
        elif len(violations) >= 1:
            score -= 0.1

        # Factor 3: Critical violations (weight 0.2)
        critical_count = sum(1 for v in violations if v.get("severity") == "CRITICAL")
        if critical_count > 0:
            score -= min(0.2, critical_count * 0.1)

        # Factor 4: Margin health (weight 0.2)
        margin_warnings = sum(
            1 for m in margins.values()
            if isinstance(m, dict) and m.get("status") in ("WARNING", "CRITICAL", "VIOLATION")
        )
        if margin_warnings >= 3:
            score -= 0.2
        elif margin_warnings >= 1:
            score -= 0.1

        score = round(max(0.0, min(1.0, score)), 3)

        high_thr = self._confidence_cfg.get("high_threshold", 0.8)
        med_thr = self._confidence_cfg.get("medium_threshold", 0.5)

        if score >= high_thr:
            level = "HIGH"
        elif score >= med_thr:
            level = "MEDIUM"
        else:
            level = "LOW"

        return level, score

    # ─── Subsystem Coupling ───────────────────────────────────────

    def _evaluate_coupling(self, telemetry, margins):
        """
        Model interactions between subsystems.
        Returns list of coupling effects that influence objective selection.
        """
        effects = []
        battery_soc = _get_tel(telemetry, "battery_soc", 100)
        solar_current = _get_tel(telemetry, "solar_current", 1.5)
        storage_pct = _get_tel(telemetry, "storage_pct", 0)
        in_eclipse = _get_tel(telemetry, "in_eclipse", False)
        link_status = _get_tel(telemetry, "link_status", "NOMINAL")

        payload_w = self._coupling_cfg.get("payload_power_w", 15)
        comms_w = self._coupling_cfg.get("comms_power_w", 12)
        heater_w = self._coupling_cfg.get("heater_power_w", 5)

        # Power <-> Payload coupling
        if battery_soc < 40 and storage_pct > 70:
            effects.append({
                "type": "POWER_PAYLOAD_CONFLICT",
                "description": "Low power limits payload operations; storage is high and needs downlink",
                "subsystems": ["POWER", "PAYLOAD"],
                "severity": "WARNING",
                "recommendation": "Prioritize downlink over imaging to reduce storage while conserving power",
            })

        # Comms <-> Storage coupling
        if link_status != "NOMINAL" and storage_pct > 80:
            effects.append({
                "type": "COMMS_STORAGE_CONFLICT",
                "description": "Degraded comms prevents data offload; storage approaching limit",
                "subsystems": ["COMMS", "STORAGE"],
                "severity": "WARNING",
                "recommendation": "Defer new imaging tasks until comms restored",
            })

        # Attitude <-> Power generation coupling
        if in_eclipse and battery_soc < 50:
            effects.append({
                "type": "ECLIPSE_POWER_STRESS",
                "description": "Eclipse period with marginal battery; no solar generation",
                "subsystems": ["ATTITUDE", "POWER"],
                "severity": "CRITICAL" if battery_soc < 30 else "WARNING",
                "recommendation": "Minimize all non-essential loads during eclipse",
            })

        # Thermal <-> Power coupling
        panel_margin = margins.get("THERMAL_PANEL", {})
        batt_margin = margins.get("THERMAL_BATTERY", {})
        if (panel_margin.get("status") in ("WARNING", "CRITICAL") or
                batt_margin.get("status") in ("WARNING", "CRITICAL")):
            if battery_soc < 50:
                effects.append({
                    "type": "THERMAL_POWER_CONFLICT",
                    "description": "Thermal management needs heater power but battery is low",
                    "subsystems": ["THERMAL", "POWER"],
                    "severity": "WARNING",
                    "recommendation": f"Heater requires {heater_w}W; assess if battery can sustain",
                })

        self._coupling_state = effects
        return effects

    # ─── Feasibility Layer ────────────────────────────────────────

    def _evaluate_feasibility(self, telemetry, margins, predictions):
        """
        Validate feasibility constraints for objective selection.
        Returns dict of feasibility checks with pass/fail and reasons.
        """
        cfg = self._feasibility_cfg
        battery_soc = _get_tel(telemetry, "battery_soc", 100)
        snr = _get_tel(telemetry, "snr", 15)
        storage_pct = _get_tel(telemetry, "storage_pct", 0)

        checks = {}

        # Power feasibility
        min_batt = cfg.get("min_battery_soc_pct", 20)
        checks["power"] = {
            "feasible": battery_soc > min_batt,
            "value": battery_soc,
            "threshold": min_batt,
            "unit": "%",
            "reason": None if battery_soc > min_batt else f"Battery SOC {battery_soc:.1f}% below minimum {min_batt}%",
        }

        # Communication feasibility
        min_snr = cfg.get("min_snr_db", 5)
        checks["communication"] = {
            "feasible": snr >= min_snr,
            "value": snr,
            "threshold": min_snr,
            "unit": "dB",
            "reason": None if snr >= min_snr else f"SNR {snr:.1f}dB below minimum {min_snr}dB",
        }

        # Storage feasibility
        max_storage = cfg.get("max_storage_pct", 95)
        checks["storage"] = {
            "feasible": storage_pct < max_storage,
            "value": storage_pct,
            "threshold": max_storage,
            "unit": "%",
            "reason": None if storage_pct < max_storage else f"Storage {storage_pct:.1f}% exceeds maximum {max_storage}%",
        }

        # Attitude/slew feasibility
        pointing_error = _get_tel(telemetry, "pointing_error", 0)
        max_slew = cfg.get("max_slew_rate_deg_s", 1.0)
        checks["attitude"] = {
            "feasible": pointing_error <= max_slew * 2,
            "value": pointing_error,
            "threshold": max_slew * 2,
            "unit": "deg",
            "reason": None if pointing_error <= max_slew * 2 else f"Pointing error {pointing_error:.2f}° exceeds slew capability",
        }

        # Power margin for tasks (predicted)
        margin_factor = cfg.get("power_margin_factor", 1.2)
        payload_w = self._coupling_cfg.get("payload_power_w", 15)
        base_w = self._coupling_cfg.get("base_load_w", 3)
        solar_current = _get_tel(telemetry, "solar_current", 1.5)
        solar_w = solar_current * 12  # approximate W from current * nominal voltage
        net_power = solar_w - base_w
        checks["power_margin"] = {
            "feasible": net_power > payload_w / margin_factor,
            "value": round(net_power, 1),
            "threshold": round(payload_w / margin_factor, 1),
            "unit": "W",
            "reason": None if net_power > payload_w / margin_factor else f"Net power {net_power:.1f}W insufficient for payload ({payload_w}W with {margin_factor}x margin)",
        }

        return checks

    # ─── Temporal Awareness ───────────────────────────────────────

    def _evaluate_temporal(self, telemetry, predictions, upcoming_tasks):
        """
        Evaluate temporal context for proactive decision-making.
        Returns context dict with upcoming events and trend indicators.
        """
        context = {
            "eclipse_imminent": False,
            "contact_imminent": False,
            "task_imminent": False,
            "power_trend": "STABLE",
            "upcoming_events": [],
        }

        in_eclipse = _get_tel(telemetry, "in_eclipse", False)
        solar_current = _get_tel(telemetry, "solar_current", 1.5)

        # Eclipse detection (proactive)
        if solar_current < 0.5 and not in_eclipse:
            context["eclipse_imminent"] = True
            context["upcoming_events"].append({
                "type": "ECLIPSE_ENTRY",
                "description": "Solar current declining — eclipse entry likely",
                "urgency": "HIGH",
            })

        # Power trend
        battery_soc = _get_tel(telemetry, "battery_soc", 100)
        if in_eclipse:
            context["power_trend"] = "DECLINING"
        elif solar_current > 1.0 and battery_soc < 90:
            context["power_trend"] = "CHARGING"
        else:
            context["power_trend"] = "STABLE"

        # Upcoming tasks
        if upcoming_tasks and len(upcoming_tasks) > 0:
            context["task_imminent"] = True
            context["upcoming_events"].append({
                "type": "SCHEDULED_TASK",
                "description": f"{len(upcoming_tasks)} task(s) pending",
                "urgency": "MEDIUM",
            })

        # Use predictions if available
        if predictions:
            if predictions.get("time_to_next_eclipse_min", 999) < 10:
                context["eclipse_imminent"] = True
                context["upcoming_events"].append({
                    "type": "ECLIPSE_APPROACHING",
                    "description": f"Eclipse in ~{predictions['time_to_next_eclipse_min']:.0f} min",
                    "urgency": "HIGH",
                })
            if predictions.get("next_contact_min", 999) < 10:
                context["contact_imminent"] = True
                context["upcoming_events"].append({
                    "type": "CONTACT_APPROACHING",
                    "description": f"Ground contact in ~{predictions['next_contact_min']:.0f} min",
                    "urgency": "MEDIUM",
                })

        self._prediction_cache = context
        return context

    # ─── Objective Selection ──────────────────────────────────────

    def _select_objective(self, telemetry, violations, upcoming_tasks,
                          feasibility, coupling_effects, temporal_context):
        """
        Select objective using configurable priority rules.
        Returns (selected_objective_name, trigger_constraints, rejected_list).
        """
        triggered_categories = {v.get("category", "") for v in violations}
        rejected = []

        # Build parameter context for condition evaluation
        param_ctx = {
            "battery_soc": _get_tel(telemetry, "battery_soc", 100),
            "solar_current": _get_tel(telemetry, "solar_current", 1.5),
            "link_status": _get_tel(telemetry, "link_status", "NOMINAL"),
            "storage_pct": _get_tel(telemetry, "storage_pct", 0),
            "component_temp": _get_tel(telemetry, "component_temp", 25),
            "battery_temp": _get_tel(telemetry, "battery_temp", 22),
            "snr": _get_tel(telemetry, "snr", 15),
            "altitude": _get_tel(telemetry, "altitude", 400),
            "pointing_error": _get_tel(telemetry, "pointing_error", 0),
            "in_eclipse": _get_tel(telemetry, "in_eclipse", False),
            "has_upcoming_tasks": bool(upcoming_tasks and len(upcoming_tasks) > 0),
        }

        for rule in self._objective_rules:
            rule_id = rule.get("id", "unknown")
            name = rule.get("name", "Unknown Objective")
            conditions = rule.get("conditions", [])
            allowed_modes = rule.get("allowed_modes", VALID_MODES)

            # Skip if current mode doesn't allow this objective
            if self.mode not in allowed_modes:
                rejected.append({
                    "objective": name,
                    "reason": f"Not allowed in {self.mode} mode",
                    "rule_id": rule_id,
                })
                continue

            # Default rule (no conditions) — always matches
            if not conditions:
                return name, [], rejected

            # Evaluate all conditions (AND logic)
            all_met = True
            trigger_constraints = []

            for cond in conditions:
                param = cond.get("parameter", "")
                op_name = cond.get("operator", "lt")
                threshold = cond.get("threshold")
                op_fn = CONDITION_OPS.get(op_name)

                if op_fn is None:
                    all_met = False
                    break

                value = param_ctx.get(param)
                if value is None:
                    all_met = False
                    break

                if not op_fn(value, threshold):
                    all_met = False
                    break

                trigger_constraints.append({
                    "parameter": param,
                    "operator": op_name,
                    "threshold": threshold,
                    "actual_value": value,
                })

            if not all_met:
                continue

            # Check feasibility for non-recovery objectives
            if rule_id not in ("power_recovery", "comm_recovery", "thermal_protection", "nominal"):
                power_ok = feasibility.get("power", {}).get("feasible", True)
                if not power_ok and rule_id in ("target_tracking", "data_offload"):
                    rejected.append({
                        "objective": name,
                        "reason": feasibility["power"].get("reason", "Power infeasible"),
                        "rule_id": rule_id,
                    })
                    continue

            return name, trigger_constraints, rejected

        # Fallback
        return "Nominal Orbit Maintenance", [], rejected

    # ─── Mode Transition with Hysteresis ──────────────────────────

    def _transition_mode(self, risk_score, recommended_mode, now):
        """
        Transition mode with hysteresis to prevent oscillation.
        Uses separate enter/exit thresholds and minimum dwell time.
        """
        th = self._mode_thresholds
        safe_enter = th.get("safe_enter", 0.6)
        safe_exit = th.get("safe_exit", 0.5)
        guarded_enter = th.get("guarded_enter", 0.3)
        guarded_exit = th.get("guarded_exit", 0.2)

        # Determine desired mode based on risk score with hysteresis
        if self.mode == "SAFE":
            if risk_score < safe_exit:
                if risk_score >= guarded_enter:
                    desired = "GUARDED"
                else:
                    desired = "AUTONOMOUS"
            else:
                desired = "SAFE"
        elif self.mode == "GUARDED":
            if risk_score >= safe_enter:
                desired = "SAFE"
            elif risk_score < guarded_exit:
                desired = "AUTONOMOUS"
            else:
                desired = "GUARDED"
        else:  # AUTONOMOUS
            if risk_score >= safe_enter:
                desired = "SAFE"
            elif risk_score >= guarded_enter:
                desired = "GUARDED"
            else:
                desired = "AUTONOMOUS"

        if desired != self.mode:
            # Escalation (toward SAFE) is always immediate
            mode_severity = {"AUTONOMOUS": 0, "GUARDED": 1, "SAFE": 2}
            if mode_severity.get(desired, 0) > mode_severity.get(self.mode, 0):
                self.previous_mode = self.mode
                self.mode = desired
                self._mode_entered_at = now
                self._pending_mode = None
                self._pending_mode_since = None
                return

            # De-escalation requires dwell time
            if self._pending_mode == desired:
                elapsed = (now - self._pending_mode_since).total_seconds()
                if elapsed >= self._min_dwell_sec:
                    self.previous_mode = self.mode
                    self.mode = desired
                    self._mode_entered_at = now
                    self._pending_mode = None
                    self._pending_mode_since = None
            else:
                self._pending_mode = desired
                self._pending_mode_since = now
        else:
            self._pending_mode = None
            self._pending_mode_since = None

    # ─── Decision Builder ─────────────────────────────────────────

    def _build_decision(self, trigger_constraints, coupling_effects,
                        temporal_context, feasibility, rejected_objectives):
        """Build a structured decision object."""
        now = datetime.now(timezone.utc)

        # Determine action based on objective
        action = self._objective_to_action(self.current_objective)

        # Build human-readable reason
        reason = self._build_reason(trigger_constraints, coupling_effects, temporal_context)

        # Determine priority
        if self.mode == "SAFE":
            priority = "CRITICAL"
        elif self.mode == "GUARDED":
            priority = "HIGH"
        elif trigger_constraints:
            priority = "MEDIUM"
        else:
            priority = "LOW"

        # Get expected outcome from matching rule
        expected_outcome = "Continue current operations"
        for rule in self._objective_rules:
            if rule.get("name") == self.current_objective:
                expected_outcome = rule.get("expected_outcome", expected_outcome)
                break

        decision = {
            "timestamp": now.isoformat(),
            "action": action,
            "reason": reason,
            "trigger_constraints": trigger_constraints,
            "priority": priority,
            "expected_outcome": expected_outcome,
            "from_objective": self.previous_objective,
            "to_objective": self.current_objective,
            "from_mode": self.previous_mode,
            "to_mode": self.mode,
            "risk_score": round(self.risk_score, 3),
            "anomaly_score": round(self.anomaly_score, 3),
            "combined_risk_score": round(self.combined_risk_score, 3),
            "ai_flagged_subsystems": list(self.ai_flagged_subsystems),
            "confidence_level": self.confidence_level,
            "confidence_score": self.confidence_score,
            "coupling_effects": [e["type"] for e in coupling_effects] if coupling_effects else [],
            "temporal_context": {
                "eclipse_imminent": temporal_context.get("eclipse_imminent", False),
                "contact_imminent": temporal_context.get("contact_imminent", False),
                "power_trend": temporal_context.get("power_trend", "STABLE"),
            },
            "rejected_objectives": rejected_objectives[:5],
            "feasibility_summary": {
                k: v.get("feasible", True)
                for k, v in feasibility.items()
            },
        }

        return decision

    def _objective_to_action(self, objective):
        """Map objective name to action identifier."""
        for rule in self._objective_rules:
            if rule.get("name") == objective:
                return rule.get("action", "maintain_nominal")
        return "maintain_nominal"

    def _build_reason(self, trigger_constraints, coupling_effects, temporal_context):
        """Build human-readable reason string from structured data."""
        parts = []

        if trigger_constraints:
            for tc in trigger_constraints:
                param = tc["parameter"]
                val = tc["actual_value"]
                op = tc["operator"]
                thr = tc["threshold"]
                if isinstance(val, float):
                    parts.append(f"{param}={val:.1f} ({op} {thr})")
                else:
                    parts.append(f"{param}={val} ({op} {thr})")

        if coupling_effects:
            for ce in coupling_effects:
                if isinstance(ce, dict):
                    parts.append(ce.get("type", "coupling_effect"))

        if temporal_context.get("eclipse_imminent"):
            parts.append("eclipse imminent")

        if not parts:
            if self.current_objective != self.previous_objective:
                return f"Transitioned from {self.previous_objective} to {self.current_objective}"
            return "Mode transition based on risk score change"

        return "; ".join(parts)

    # ─── Operator Override ────────────────────────────────────────

    def set_mode(self, mode: str, operator: str = "OPERATOR",
                 reason: str = "Manual override") -> dict:
        """Operator override with full traceability."""
        if mode not in VALID_MODES:
            return {"status": "ERROR", "message": f"Invalid mode: {mode}"}

        now = datetime.now(timezone.utc)
        prev_mode = self.mode

        self.override_active = True
        self._override_mode = mode
        self._override_operator = operator
        self._override_reason = reason
        self._override_started_at = now
        self.previous_mode = self.mode
        self.mode = mode

        decision = {
            "timestamp": now.isoformat(),
            "action": "operator_override",
            "reason": f"Operator override by {operator}: {reason}",
            "trigger_constraints": [],
            "priority": "HIGH",
            "expected_outcome": f"System operates in {mode} mode under operator control",
            "from_objective": self.current_objective,
            "to_objective": self.current_objective,
            "from_mode": prev_mode,
            "to_mode": mode,
            "risk_score": self.risk_score,
            "confidence_level": self.confidence_level,
            "confidence_score": self.confidence_score,
            "coupling_effects": [],
            "temporal_context": {},
            "rejected_objectives": [],
            "feasibility_summary": {},
            "override": {
                "operator": operator,
                "reason": reason,
                "previous_mode": prev_mode,
            },
        }

        self.last_decision = decision
        self.decisions_log.append(decision)

        return {
            "status": "OK",
            "mode": mode,
            "override_active": True,
            "operator": operator,
            "previous_mode": prev_mode,
        }

    def release_override(self, operator: str = "OPERATOR") -> dict:
        """Release operator override with clean resumption."""
        now = datetime.now(timezone.utc)
        prev_mode = self.mode
        override_duration = None

        if self._override_started_at:
            override_duration = round(
                (now - self._override_started_at).total_seconds(), 1
            )

        self.override_active = False
        prev_operator = self._override_operator
        prev_reason = self._override_reason
        self._override_mode = None
        self._override_operator = None
        self._override_reason = None
        self._override_started_at = None
        self._mode_entered_at = now

        decision = {
            "timestamp": now.isoformat(),
            "action": "release_override",
            "reason": f"Override released by {operator} after {override_duration}s",
            "trigger_constraints": [],
            "priority": "MEDIUM",
            "expected_outcome": "Resume automatic mode selection based on risk assessment",
            "from_objective": self.current_objective,
            "to_objective": self.current_objective,
            "from_mode": prev_mode,
            "to_mode": prev_mode,
            "risk_score": self.risk_score,
            "confidence_level": self.confidence_level,
            "confidence_score": self.confidence_score,
            "coupling_effects": [],
            "temporal_context": {},
            "rejected_objectives": [],
            "feasibility_summary": {},
            "override": {
                "released": True,
                "operator": operator,
                "previous_operator": prev_operator,
                "previous_reason": prev_reason,
                "duration_sec": override_duration,
                "previous_mode": prev_mode,
            },
        }

        self.last_decision = decision
        self.decisions_log.append(decision)

        return {
            "status": "OK",
            "override_active": False,
            "override_duration_sec": override_duration,
            "previous_mode": prev_mode,
        }

    # ─── Status & Logging ─────────────────────────────────────────

    def get_status(self) -> dict:
        """Return full autonomy status for API consumption."""
        override_info = None
        if self.override_active:
            duration = None
            if self._override_started_at:
                duration = round(
                    (datetime.now(timezone.utc) - self._override_started_at).total_seconds(), 1
                )
            override_info = {
                "active": True,
                "operator": self._override_operator,
                "reason": self._override_reason,
                "duration_sec": duration,
                "forced_mode": self._override_mode,
            }

        pending_transition = None
        if self._pending_mode:
            elapsed = 0
            if self._pending_mode_since:
                elapsed = round(
                    (datetime.now(timezone.utc) - self._pending_mode_since).total_seconds(), 1
                )
            pending_transition = {
                "target_mode": self._pending_mode,
                "elapsed_sec": elapsed,
                "required_sec": self._min_dwell_sec,
            }

        return {
            "mode": self.mode,
            "previous_mode": self.previous_mode,
            "current_objective": self.current_objective or "Nominal Orbit Maintenance",
            "risk_score": round(self.risk_score, 3),
            "anomaly_score": round(self.anomaly_score, 3),
            "combined_risk_score": round(self.combined_risk_score, 3),
            "ai_flagged_subsystems": list(self.ai_flagged_subsystems),
            "ai_confidence": self.ai_confidence,
            "ai_weight": self.ai_weight,
            "confidence_level": self.confidence_level,
            "confidence_score": round(self.confidence_score, 3),
            # Legacy compatibility
            "confidence": round(self.confidence_score, 3),
            "last_decision": self.last_decision,
            "last_decision_time": self.last_decision.get("timestamp", "") if isinstance(self.last_decision, dict) else "",
            "override_active": self.override_active,
            "override_info": override_info,
            "pending_transition": pending_transition,
            "feasibility": self._last_feasibility,
            "coupling_effects": self._coupling_state,
            "temporal_context": self._prediction_cache,
            "auto_decisions_count": len(self.decisions_log),
        }

    def get_decisions_log(self) -> list:
        """Return full decision log as list."""
        return list(self.decisions_log)

    def get_latest_decisions(self, count: int = 10) -> list:
        """Return last N decisions."""
        return list(self.decisions_log)[-count:]

    def reset(self):
        """Reset to initial state."""
        self.__init__()
