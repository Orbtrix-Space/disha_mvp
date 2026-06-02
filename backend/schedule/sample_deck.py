"""
Sample target deck — 30 Pacific-recon AOIs.

The targets are realistic in priority + cloud-tolerance distribution
but anchored to a relative "today" anchor so the default horizon
always contains them (the previous reference deck was dated weeks
before the horizon, which produced an all-rejected demo).

Call `build_sample_deck(anchor=<datetime>)` to produce a list of
dicts compatible with the scheduler's expected target schema:

    request_id, aoi_name, lat_deg, lon_deg,
    start_time, stop_time, priority, duration_sec, cloud_max_pct
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import List


# 30 AOIs along the Pacific rim — realistic-ish lat/lon, names varied
# so the dashboard's per-AOI cloud values feel non-synthetic.
_AOIS = [
    ("TOKYO_BAY",          35.62, 139.77),
    ("OSAKA_PORT",         34.69, 135.50),
    ("JEJU_NORTH",         33.50, 126.62),
    ("BUSAN_TERMINAL",     35.10, 129.04),
    ("SHANGHAI_DELTA",     31.23, 121.47),
    ("KEELUNG_HARBOR",     25.13, 121.74),
    ("HONG_KONG_VICTORIA", 22.30, 114.17),
    ("MANILA_BAY",         14.59, 120.98),
    ("SUBIC_BAY",          14.79, 120.27),
    ("KAOHSIUNG_PIER",     22.61, 120.27),
    ("DA_NANG_COAST",      16.05, 108.20),
    ("SINGAPORE_STRAIT",    1.27, 103.84),
    ("MALACCA_LANE",        2.50, 101.50),
    ("JAKARTA_NORTH",      -6.13, 106.81),
    ("DARWIN_HARBOUR",    -12.45, 130.84),
    ("CAIRNS_INLET",      -16.92, 145.78),
    ("BRISBANE_BAY",      -27.47, 153.03),
    ("NORFOLK_PACIFIC",   -29.04, 167.95),
    ("GUAM_NAVAL",         13.44, 144.79),
    ("PEARL_HARBOR",       21.36, -157.97),
    ("SAN_DIEGO_NORTH",    32.71, -117.16),
    ("LOS_ANGELES_PORT",   33.74, -118.27),
    ("MONTEREY_BAY",       36.60, -121.89),
    ("ALAMEDA_NAS",        37.78, -122.32),
    ("SEATTLE_SOUND",      47.60, -122.33),
    ("ANCHORAGE_INLET",    61.22, -149.90),
    ("PETROPAVLOVSK_BAY",  53.02,  158.65),
    ("VLADIVOSTOK_PORT",   43.12,  131.89),
    ("MUMBAI_OFFSHORE",    18.95,   72.83),
    ("PORT_BLAIR",         11.62,   92.73),
]


def _det_pri(name: str) -> int:
    """Stable priority in [1, 4] derived from the AOI name."""
    h = int(hashlib.sha256(name.encode()).hexdigest()[:8], 16)
    return [1, 1, 2, 2, 2, 3, 3, 3, 3, 4][h % 10]


def _det_cloud_max(name: str) -> float:
    """Stable cloud tolerance — most targets accept 35-50 %, some pickier."""
    h = int(hashlib.sha256((name + "cmax").encode()).hexdigest()[:8], 16)
    return float([25, 30, 35, 40, 40, 45, 45, 50, 55][h % 9])


def build_sample_deck(anchor: datetime | None = None,
                      horizon_hours: float = 96.0) -> List[dict]:
    """
    Produce a 30-target deck whose requested windows fall inside the
    horizon `[anchor, anchor + horizon_hours]`. Each target is given a
    multi-hour window so the scheduler can choose where to place its
    fixed-duration imaging task.
    """
    if anchor is None:
        anchor = datetime.now(timezone.utc).replace(microsecond=0)
    deck: List[dict] = []
    h_total = timedelta(hours=horizon_hours)
    for i, (name, lat, lon) in enumerate(_AOIS, start=1):
        # Stagger requested windows across the horizon so the scheduler
        # has work spread over multiple orbits.
        offset = h_total * ((i - 1) / max(1, len(_AOIS) - 1)) * 0.7
        win_start = anchor + offset
        # Generous request window (the access geometry is the real
        # constraint; the window just bounds it)
        win_stop = min(win_start + timedelta(hours=12), anchor + h_total)
        deck.append({
            "request_id":    f"R{i:03d}",
            "aoi_name":      name,
            "lat_deg":       lat,
            "lon_deg":       lon,
            "start_time":    win_start,
            "stop_time":     win_stop,
            "priority":      _det_pri(name),
            "duration_sec":  60,            # 1-minute imaging task
            "cloud_max_pct": _det_cloud_max(name),
        })
    return deck
