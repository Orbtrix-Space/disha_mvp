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
