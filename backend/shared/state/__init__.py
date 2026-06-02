"""
shared.state — live mission state, telemetry frame assembly, recording.

`MissionState` is the single source of truth for the current satellite
condition during the 1 Hz tick loop. `telemetry_manager` builds the
broadcast frame consumed by the WebSocket clients; `telemetry_recorder`
persists each frame to CSV for offline replay and AI training.
"""

from .mission_state import MissionState  # noqa: F401
from .telemetry_manager import ConnectionManager, build_telemetry_frame  # noqa: F401
from .telemetry_recorder import TelemetryRecorder  # noqa: F401
