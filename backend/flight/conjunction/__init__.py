"""
flight.conjunction — close-approach screening, Pc, and avoidance sizing.

Consumes the covariance + epoch state from `flight.estimation` and
propagates with `shared.dynamics`. Produces `ScreenResult` and
`ManeuverRecommendation` objects serialized by `flight.pipeline`.
"""

from .screening import (  # noqa: F401
    SecondaryObject,
    CloseApproach,
    ScreenResult,
    ManeuverRecommendation,
    screen,
    recommend_maneuver,
    synthetic_threats,
)
