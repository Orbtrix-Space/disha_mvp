"""
shared.ground — ground-station catalog and pass / contact prediction.

Depends on `shared.dynamics` for propagation and visibility geometry.
Consumed by Schedule (pass-window planning), Flight (contact-aware
maneuver timing), and Control (live contact state on the strip).
"""

from .stations import (  # noqa: F401
    get_ground_stations,
    set_ground_stations,
    add_custom_station,
    remove_station,
    get_available_networks,
    get_active_network,
    check_contact_now,
    GroundStationPassPredictor,
)
