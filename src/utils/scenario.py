import random
from datetime import datetime, timedelta
from src.models.schemas import UserRequest


def generate_scenarios(n=10):
    """
    Generates 'n' random requests to stress-test the scheduler.
    Defaults to 10 for Week 3 stress testing.
    """

    # expanded list of targets
    cities = [
        {"name": "Bangalore", "lat": 12.9716, "lon": 77.5946},
        {"name": "Delhi",     "lat": 28.7041, "lon": 77.1025},
        {"name": "Mumbai",    "lat": 19.0760, "lon": 72.8777},
        {"name": "Chennai",   "lat": 13.0827, "lon": 80.2707},
        {"name": "Kolkata",   "lat": 22.5726, "lon": 88.3639},
        {"name": "Hyderabad", "lat": 17.3850, "lon": 78.4867},
        {"name": "Ahmedabad", "lat": 23.0225, "lon": 72.5714},
        {"name": "Pune",      "lat": 18.5204, "lon": 73.8567},
        {"name": "Jaipur",    "lat": 26.9124, "lon": 75.7873},
        {"name": "Lucknow",   "lat": 26.8467, "lon": 80.9462}
    ]

    requests = []
    base_time = datetime.now()

    print(f"[SCENARIO] Generating {n} random requests across India...")

    for i in range(n):
        city = random.choice(cities)

        # Randomize priority (1 = Low, 10 = Critical)
        prio = random.randint(1, 10)

        # Randomize start time slightly to create overlaps
        # Some users want it NOW, some want it 1-3 hours from now
        offset_hours = random.randint(0, 3)

        req = UserRequest(
            request_id=f"REQ-{i+1:03d}-{city['name'][:3].upper()}",
            target_lat=city["lat"],
            target_lon=city["lon"],
            priority=prio,
            window_start=base_time + timedelta(hours=offset_hours),
            window_end=base_time + timedelta(hours=24),  # 1 day window
            min_duration_sec=60
        )

        requests.append(req)

        print(f"   > Created: {req.request_id} (Priority {prio}) for {city['name']}")

    return requests
