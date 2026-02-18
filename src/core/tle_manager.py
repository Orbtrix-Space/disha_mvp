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

    async def fetch_tle(self, norad_id: int) -> dict:
        url = f"https://celestrak.org/NORAD/elements/gp.php?CATNR={norad_id}&FORMAT=TLE"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10.0)
            resp.raise_for_status()

        lines = resp.text.strip().split('\n')
        if len(lines) < 3:
            raise ValueError(f"Invalid TLE response for NORAD ID {norad_id}")

        self.satellite_name = lines[0].strip()
        self.tle_line1 = lines[1].strip()
        self.tle_line2 = lines[2].strip()
        self.norad_id = norad_id
        self.satrec = Satrec.twoline2rv(self.tle_line1, self.tle_line2, WGS72)
        return self.get_tle_info()

    def propagate_at(self, dt: datetime) -> tuple:
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
        return {
            "norad_id": self.norad_id,
            "satellite_name": self.satellite_name,
            "tle_line1": self.tle_line1,
            "tle_line2": self.tle_line2,
            "loaded": self.satrec is not None,
        }

    def clear(self):
        self.satrec = None
        self.tle_line1 = ""
        self.tle_line2 = ""
        self.satellite_name = ""
        self.norad_id = None
