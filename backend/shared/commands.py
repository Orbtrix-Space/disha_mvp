"""
DISHA Beta — Command Engine
Telecommand generation, approval workflow, command history.
Supports all four task types: IMAGING, DOWNLINK, MANOEUVRE, CONTACT.
"""

import uuid
from datetime import datetime, timezone
from collections import OrderedDict


# Telecommand templates for all task types
COMMAND_TEMPLATES = {
    "IMAGING": [
        {"type": "ADCS_SLEW", "description": "Slew to nadir-pointing for imaging"},
        {"type": "PAYLOAD_ON", "description": "Power on imaging payload"},
        {"type": "IMAGING_START", "description": "Begin image capture sequence"},
        {"type": "IMAGING_STOP", "description": "End image capture"},
        {"type": "PAYLOAD_OFF", "description": "Power off imaging payload"},
    ],
    "DOWNLINK": [
        {"type": "ADCS_SLEW", "description": "Slew to ground station pointing"},
        {"type": "COMMS_TX_ON", "description": "Enable high-gain transmitter"},
        {"type": "DOWNLINK_START", "description": "Begin data downlink"},
        {"type": "DOWNLINK_STOP", "description": "End data downlink"},
        {"type": "COMMS_TX_OFF", "description": "Disable high-gain transmitter"},
    ],
    "MANOEUVRE": [
        {"type": "ADCS_SLEW", "description": "Slew to manoeuvre attitude"},
        {"type": "THRUSTER_ARM", "description": "Arm thruster system"},
        {"type": "BURN_START", "description": "Begin orbit manoeuvre burn"},
        {"type": "BURN_STOP", "description": "End orbit manoeuvre burn"},
        {"type": "THRUSTER_SAFE", "description": "Safe thruster system"},
    ],
    "CONTACT": [
        {"type": "ADCS_SLEW", "description": "Slew to ground station pointing"},
        {"type": "COMMS_TX_ON", "description": "Enable communications transmitter"},
        {"type": "CONTACT_START", "description": "Begin ground contact session"},
        {"type": "CONTACT_STOP", "description": "End ground contact session"},
        {"type": "COMMS_TX_OFF", "description": "Disable communications transmitter"},
    ],
}


class CommandEngine:
    def __init__(self):
        self.sequences = OrderedDict()
        self.command_log = []

    def generate_sequence(self, plan_details: list, plan_id: str = None) -> dict:
        """Convert scheduled tasks into a telecommand sequence."""
        if plan_id is None:
            plan_id = f"PLAN-{uuid.uuid4().hex[:8]}"

        sequence_id = f"SEQ-{uuid.uuid4().hex[:8]}"
        commands = []

        for task in plan_details:
            action = task.get("action", "IMAGING")
            template = COMMAND_TEMPLATES.get(action, COMMAND_TEMPLATES["IMAGING"])
            task_id = task.get("task_id", f"TASK-{uuid.uuid4().hex[:6]}")
            start_time = task.get("start_time", "")

            for i, cmd_template in enumerate(template):
                command = {
                    "command_id": f"CMD-{uuid.uuid4().hex[:8]}",
                    "task_id": task_id,
                    "command": cmd_template["type"],
                    "command_type": cmd_template["type"],
                    "description": cmd_template["description"],
                    "delay_sec": i * 5,
                    "parameters": {
                        "task_action": action,
                        "sequence_order": i + 1,
                    },
                    "scheduled_time": start_time,
                    "status": "PENDING",
                }
                commands.append(command)

        sequence = {
            "sequence_id": sequence_id,
            "plan_id": plan_id,
            "status": "PENDING",
            "commands": commands,
            "total_commands": len(commands),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "approved": False,
            "approved_by": None,
            "approved_at": None,
        }

        self.sequences[sequence_id] = sequence
        self._log("GENERATE", sequence_id, f"Generated {len(commands)} commands from {len(plan_details)} tasks")
        return sequence

    def approve_sequence(self, sequence_id: str, operator: str = "OPERATOR") -> dict:
        """Approve a command sequence for dispatch."""
        if sequence_id not in self.sequences:
            return {"status": "ERROR", "message": f"Sequence {sequence_id} not found"}

        seq = self.sequences[sequence_id]
        if seq["approved"]:
            return {"status": "ERROR", "message": "Sequence already approved"}

        seq["status"] = "APPROVED"
        seq["approved"] = True
        seq["approved_by"] = operator
        seq["approved_at"] = datetime.now(timezone.utc).isoformat()

        for cmd in seq["commands"]:
            cmd["status"] = "APPROVED"

        self._log("APPROVE", sequence_id, f"Approved by {operator}")
        return {"status": "APPROVED", "sequence": seq}

    def get_sequence(self, sequence_id: str) -> dict:
        return self.sequences.get(sequence_id)

    def get_all_sequences(self) -> list:
        return list(reversed(self.sequences.values()))

    def get_log(self) -> list:
        return list(reversed(self.command_log))

    def _log(self, action: str, sequence_id: str, detail: str):
        self.command_log.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "sequence_id": sequence_id,
            "detail": detail,
        })

    def log_command(self, command: str, status: str):
        """Log an ad-hoc operator command."""
        self.command_log.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": "ADHOC",
            "sequence_id": None,
            "detail": f"{command} -> {status}",
        })

    def reset(self):
        self.sequences.clear()
        self.command_log.clear()

    def replan_on_autonomy_change(self, new_mode: str, new_objective: str,
                                  previous_mode: str,
                                  previous_objective: str) -> dict:
        """
        Re-plan hook called from the 1 Hz tick when autonomy mode or
        objective changed. Closes the loop: autonomy decision → command
        queue update, in the same tick.

        - Escalation (AUTONOMOUS → GUARDED/SAFE): defer PENDING sequences.
        - De-escalation (→ AUTONOMOUS): resume DEFERRED sequences.
        - Objective change only (same mode): logged but queue untouched.

        Returns a summary suitable for inclusion in the telemetry frame
        so the unified UI can render a "re-plan triggered" cue.
        """
        affected = []
        mode_changed = new_mode != previous_mode
        objective_changed = new_objective != previous_objective

        if mode_changed and new_mode in ("SAFE", "GUARDED") and previous_mode == "AUTONOMOUS":
            for sid, seq in self.sequences.items():
                if seq.get("status") == "PENDING":
                    seq["status"] = "DEFERRED"
                    seq["deferred_reason"] = (
                        f"Autonomy {previous_mode}->{new_mode}: {new_objective}"
                    )
                    for cmd in seq.get("commands", []):
                        cmd["status"] = "DEFERRED"
                    affected.append(sid)
            if affected:
                self._log(
                    "REPLAN_DEFER", ",".join(affected),
                    f"{previous_mode}->{new_mode}: {len(affected)} sequence(s) deferred"
                )
        elif mode_changed and new_mode == "AUTONOMOUS" and previous_mode != "AUTONOMOUS":
            for sid, seq in self.sequences.items():
                if seq.get("status") == "DEFERRED":
                    seq["status"] = "PENDING"
                    seq.pop("deferred_reason", None)
                    for cmd in seq.get("commands", []):
                        if cmd.get("status") == "DEFERRED":
                            cmd["status"] = "PENDING"
                    affected.append(sid)
            if affected:
                self._log(
                    "REPLAN_RESUME", ",".join(affected),
                    f"{previous_mode}->{new_mode}: {len(affected)} sequence(s) resumed"
                )
        elif objective_changed and previous_objective is not None:
            self._log(
                "REPLAN_OBJECTIVE", "-",
                f"Objective {previous_objective}->{new_objective}; queue unchanged"
            )

        triggered = bool(affected) or (
            objective_changed and previous_objective is not None
        )
        return {
            "triggered": triggered,
            "affected_sequences": affected,
            "mode_transition": f"{previous_mode}->{new_mode}" if mode_changed else None,
            "objective_transition": (
                f"{previous_objective}->{new_objective}" if objective_changed else None
            ),
        }
