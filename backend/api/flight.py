"""
DISHA Beta — Flight Dynamics API Routes
GET /orbit/prediction, GET /flight/orbital-elements, GET /flight/passes, GET /flight/ground-stations
"""

from datetime import timedelta
from fastapi import APIRouter
from backend.core.flight_dynamics import propagate_orbit, eci_to_ecef, ecef_to_lla, state_to_keplerian
from backend.core.ground_stations import get_ground_stations

router = APIRouter(tags=["Flight"])


def get_deps():
    from backend.main import satellite, tle_manager, pass_predictor
    return satellite, tle_manager, pass_predictor


@router.get("/orbit/prediction")
def get_orbit_prediction():
    satellite, tle_manager, _ = get_deps()
    points = []

    if tle_manager.satrec:
        now = satellite.current_time
        for i in range(0, 5400, 60):
            dt = now + timedelta(seconds=i)
            try:
                pos, vel = tle_manager.propagate_at(dt)
                r_ecef = eci_to_ecef(pos, dt)
                lla = ecef_to_lla(r_ecef)
                points.append({
                    "lat": round(lla["lat"], 4),
                    "lon": round(lla["lon"], 4),
                    "alt_km": round(lla["alt_km"], 1),
                })
            except Exception:
                break
    else:
        initial_state = {
            "position": satellite.position.tolist() if hasattr(satellite.position, 'tolist') else list(satellite.position),
            "velocity": satellite.velocity.tolist() if hasattr(satellite.velocity, 'tolist') else list(satellite.velocity),
            "epoch": satellite.current_time,
        }
        trajectory = propagate_orbit(initial_state, 5400, step_size=60)
        for step in trajectory:
            r_eci = step["eci_state"][:3]
            dt = satellite.current_time + timedelta(seconds=int(step["time_offset"]))
            r_ecef = eci_to_ecef(r_eci, dt)
            lla = ecef_to_lla(r_ecef)
            points.append({
                "lat": round(lla["lat"], 4),
                "lon": round(lla["lon"], 4),
                "alt_km": round(lla["alt_km"], 1),
            })

    return {"points": points}


@router.get("/flight/orbital-elements")
def get_orbital_elements():
    satellite, _, _ = get_deps()
    return state_to_keplerian(satellite.position.tolist(), satellite.velocity.tolist())


@router.get("/flight/passes")
def get_passes():
    satellite, _, pass_predictor = get_deps()
    try:
        passes = pass_predictor.compute_passes(satellite, duration_hours=24.0)
        return {"passes": passes}
    except Exception as e:
        return {"passes": [], "error": str(e)}


@router.get("/flight/ground-stations")
def get_ground_stations_endpoint():
    stations = get_ground_stations()
    return {"stations": stations}
