"""
shared.dynamics — foundational orbit propagation and frame transforms.

The base layer every page sits on. Control needs it for live state
propagation, Flight for OD and conjunction screening, Schedule for
pass prediction, FDIR for orbit-derived constraint checks.

No other DISHA module should reimplement any of these — if something
needs to propagate or convert, it imports from here.
"""

from .propagator import (  # noqa: F401
    rk4_step,
    propagate_orbit,
    eci_to_ecef,
    ecef_to_lla,
    state_to_keplerian,
    is_in_eclipse,
    predict_eclipse_simple,
    is_visible,
    check_feasibility,
)
