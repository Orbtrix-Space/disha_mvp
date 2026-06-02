"""
In-memory state holder for the NEXUS-style constellation tasking
layer. No DB, no auth — single-process demo.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import List, Optional

from .constellation import SatelliteSpec, default_constellation
from .sample_deck import build_sample_deck
from .scheduler import ScheduleResult


class SchedulerState:
    def __init__(self):
        self._lock = threading.Lock()
        self.mission_name: str = "PACIFIC RECON · Q2"
        self.constellation: List[SatelliteSpec] = default_constellation()
        # Anchor sample deck to "now" so the default horizon contains it.
        self._anchor = datetime.now(timezone.utc).replace(microsecond=0)
        self.targets: List[dict] = build_sample_deck(anchor=self._anchor)
        self.deck_filename: str = "sample_targets_q2.xlsx"
        self.horizon_start: datetime = self._anchor
        self.horizon_stop: datetime = self._anchor.replace() + (
            self.targets[-1]["stop_time"] - self._anchor
        )
        # Last computed results
        self.last_result: Optional[ScheduleResult] = None
        self.last_baseline: Optional[ScheduleResult] = None

    def replace_targets(self, targets: List[dict], filename: str):
        with self._lock:
            self.targets = targets
            self.deck_filename = filename
            self.last_result = None
            self.last_baseline = None

    def set_horizon(self, start: datetime, stop: datetime):
        with self._lock:
            self.horizon_start = start
            self.horizon_stop = stop

    def set_mission_name(self, name: str):
        with self._lock:
            self.mission_name = name

    def set_constellation(self, sats: List[SatelliteSpec]):
        with self._lock:
            self.constellation = sats
            self.last_result = None
            self.last_baseline = None
