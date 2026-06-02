"""
schedule — Schedule page: mission planning and command queueing.

Takes user task requests, evaluates feasibility against power, eclipse,
pass windows, and constraint margins, produces a schedulable plan, and
queues approved commands via `shared.commands`. Composes:
  shared.dynamics    propagation + eclipse
  shared.power       energy budget
  shared.ground      pass windows
  shared.constraints telemetry margin checks
  shared.commands    command queue (Control approves on the other side)
"""

from .planner import (  # noqa: F401
    generate_mission_plan,
    compute_feasibility,
    detect_conflicts,
)
