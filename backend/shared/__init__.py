"""
shared — foundations imported by every page-aligned module.

Anything in `shared/` may be imported by any page folder (control,
flight, fdir, schedule). Page folders MUST NOT import each other —
cross-page reuse means it belongs here instead.

Sub-packages:
  dynamics     orbit propagation, frame transforms, eclipse geometry
  state        live MissionState, telemetry frame builder, recorder
  tle          TLE catalog and parsing
  ground       ground station catalog and pass prediction
  models       Pydantic schemas, config loader, physical constants

Single-file modules:
  power.py        solar / battery model + projection helpers
  constraints.py  telemetry margin computation + rule evaluation
  commands.py     command queue (Schedule queues, Control approves)
"""
