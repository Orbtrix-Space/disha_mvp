"""
fdir — FDIR / Monitor page: fault detection, isolation, recovery.

Two layers run side-by-side in the tick loop:
  engine.FDIREngine   rule-based limit / signature checks
  ai_monitor.AIMonitor LSTM autoencoder flagging statistical anomalies
                       the rules can miss (augments, never replaces)

Alerts produced here are consumed by `control.autonomy` to drive mode
transitions. FDIR itself does not import from any page folder.
"""

from .engine import FDIREngine, FDIRAlert  # noqa: F401
from .ai_monitor import AIMonitor, AIMonitorResult, FlaggedSubsystem  # noqa: F401
