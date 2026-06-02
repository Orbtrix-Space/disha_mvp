"""
control — Control / C3 Ops page logic.

What the operator sees on `/` (3D globe, autonomy decisions, command
panel, demo Operations). Owns:
  autonomy        on-board decision layer driven by FDIR + constraints
  demo_scenarios  inject perturbations to exercise the pipeline end-to-end

Imports only from `shared/`. Cross-page concerns (commands, power
projection) live in `shared/` so Control and Schedule can both use them
without coupling to each other.
"""

from .autonomy import AutonomyManager  # noqa: F401
from .demo_scenarios import (  # noqa: F401
    DemoScenarioInjector,
    ScenarioSpec,
    ScenarioRun,
    get_scenario,
    list_scenarios,
    expected_timeline,
)
