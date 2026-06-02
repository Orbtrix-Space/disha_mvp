"""
DISHA Beta — TLE Manager
Fetch TLE from CelesTrak, parse, cache. SGP4 propagation.
"""

import asyncio
import math
import httpx
from sgp4.api import Satrec, WGS72
from sgp4.api import jday
from datetime import datetime, timezone


class TLEManager:
    def __init__(self):
        self.satrec = None
        self.tle_line1 = ""
        self.tle_line2 = ""
        self.satellite_name = ""
        self.norad_id = None
        self.fetch_time = None

    def _fetch_tle_sync(self, norad_id: int) -> str:
        """Sync HTTP fetch — httpx.AsyncClient has connectivity issues on Windows."""
        url = f"https://celestrak.org/NORAD/elements/gp.php?CATNR={norad_id}&FORMAT=TLE"
        resp = httpx.get(url, timeout=15.0)
        resp.raise_for_status()
        return resp.text

    async def fetch_tle(self, norad_id: int) -> dict:
        """Fetch TLE from CelesTrak GP API by NORAD ID."""
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, self._fetch_tle_sync, norad_id)

        lines = text.strip().split('\n')
        if len(lines) < 3:
            raise ValueError(f"Invalid TLE response for NORAD ID {norad_id}")

        self.satellite_name = lines[0].strip()
        self.tle_line1 = lines[1].strip()
        self.tle_line2 = lines[2].strip()
        self.norad_id = norad_id
        self.satrec = Satrec.twoline2rv(self.tle_line1, self.tle_line2, WGS72)
        self.fetch_time = datetime.now(timezone.utc)
        return self.get_tle_info()

    def load_from_lines(self, name: str, line1: str, line2: str) -> dict:
        """Build a Satrec directly from two raw TLE lines (operator paste)."""
        line1 = line1.strip()
        line2 = line2.strip()
        if not (line1.startswith("1 ") and line2.startswith("2 ")):
            raise ValueError("TLE lines must start with '1 ' and '2 '")
        self.satellite_name = (name or "PASTED-SAT").strip()
        self.tle_line1 = line1
        self.tle_line2 = line2
        self.satrec = Satrec.twoline2rv(line1, line2, WGS72)
        # NORAD id is encoded in columns 3-7 of line 1
        try:
            self.norad_id = int(line1[2:7])
        except ValueError:
            self.norad_id = None
        self.fetch_time = datetime.now(timezone.utc)
        return self.get_tle_info()

    def load_from_elements(self, name: str, elements: dict) -> dict:
        """
        Build a Satrec from classical mean orbital elements via sgp4init.
        This is real SGP4 propagation — no faked state vector.

        Expected element keys (degrees / rev-per-day):
            inclination_deg, raan_deg, eccentricity,
            arg_perigee_deg, mean_anomaly_deg, mean_motion_rev_day
        """
        inclo = math.radians(float(elements["inclination_deg"]))
        nodeo = math.radians(float(elements["raan_deg"]))
        ecco = float(elements["eccentricity"])
        argpo = math.radians(float(elements["arg_perigee_deg"]))
        mo = math.radians(float(elements["mean_anomaly_deg"]))
        rev_per_day = float(elements["mean_motion_rev_day"])
        # SGP4 wants mean motion in radians/minute
        no_kozai = rev_per_day * 2.0 * math.pi / 1440.0

        now = datetime.now(timezone.utc)
        jd, fr = jday(now.year, now.month, now.day,
                      now.hour, now.minute,
                      now.second + now.microsecond / 1e6)
        # sgp4 epoch: days since 1949 December 31 00:00 UT
        epoch = (jd + fr) - 2433281.5

        satrec = Satrec()
        satrec.sgp4init(
            WGS72, "i", 99999, epoch,
            0.0,    # bstar
            0.0,    # ndot
            0.0,    # nddot
            ecco, argpo, inclo, mo, no_kozai, nodeo,
        )
        self.satrec = satrec
        self.satellite_name = (name or "MANUAL-SAT").strip()
        self.norad_id = 99999
        self.tle_line1 = "(manual orbital elements)"
        self.tle_line2 = (
            f"i={elements['inclination_deg']} raan={elements['raan_deg']} "
            f"e={elements['eccentricity']} n={rev_per_day}"
        )
        self.fetch_time = now
        return self.get_tle_info()

    def propagate_at(self, dt: datetime) -> tuple:
        """Propagate to given datetime using SGP4. Returns (position, velocity) in km."""
        if self.satrec is None:
            raise ValueError("No TLE loaded")

        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)

        jd, fr = jday(
            dt.year, dt.month, dt.day,
            dt.hour, dt.minute,
            dt.second + dt.microsecond / 1e6
        )
        e, r, v = self.satrec.sgp4(jd, fr)
        if e != 0:
            raise RuntimeError(f"SGP4 error code {e}")

        return list(r), list(v)

    def get_tle_info(self) -> dict:
        """Return TLE metadata including epoch age."""
        info = {
            "norad_id": self.norad_id,
            "satellite_name": self.satellite_name,
            "tle_line1": self.tle_line1,
            "tle_line2": self.tle_line2,
            "loaded": self.satrec is not None,
        }
        if self.fetch_time:
            age_hours = (datetime.now(timezone.utc) - self.fetch_time).total_seconds() / 3600
            info["epoch_age_hours"] = round(age_hours, 2)
        return info

    def clear(self):
        """Reset all TLE data."""
        self.satrec = None
        self.tle_line1 = ""
        self.tle_line2 = ""
        self.satellite_name = ""
        self.norad_id = None
        self.fetch_time = None
