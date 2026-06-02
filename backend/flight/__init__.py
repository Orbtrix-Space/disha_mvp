"""
flight — Flight page: automated OD → conjunction → maneuver pipeline.

Operator pastes a GPS arc, the pipeline runs:
  estimation/   batch weighted LSQ orbit determination
  conjunction/  close-approach screening, Pc, maneuver sizing
  pipeline.py   the orchestrator that sequences ingest → OD → screen → recommend

All numerics sit on `shared.dynamics` (propagator + STM). No imports
from other page folders.
"""

from .pipeline import FlightPipeline  # noqa: F401
