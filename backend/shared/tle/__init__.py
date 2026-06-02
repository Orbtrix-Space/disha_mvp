"""
shared.tle — Two-Line Element ingestion, parsing, and state init.

Bridges external TLE catalogs to the internal state representation that
`shared.dynamics` propagates. Used at startup to seed MissionState and
on the fly when the operator pastes a new TLE in the Control sidebar.
"""

from .manager import TLEManager  # noqa: F401
