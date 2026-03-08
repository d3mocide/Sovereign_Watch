"""
RepeaterBook source adapter.
"""

import asyncio
import logging
import os

import httpx

logger = logging.getLogger("rf_pulse.repeaterbook")

RB_BASE_URL  = "https://www.repeaterbook.com/api/export.php"
RB_TIMEOUT   = 20.0
RB_RADIUS_MI = int(os.getenv("RF_RB_RADIUS_MI", "200"))
CENTER_LAT   = float(os.getenv("CENTER_LAT", "45.5152"))
CENTER_LON   = float(os.getenv("CENTER_LON", "-122.6784"))


class RepeaterBookSource:
    def __init__(self, producer, redis_client, topic, fetch_interval_h):
        self.producer       = producer
        self.redis_client   = redis_client
        self.topic          = topic
        self.interval_sec   = fetch_interval_h * 3600
        self.token          = os.getenv("REPEATERBOOK_API_TOKEN", "")

    async def loop(self):
        while True:
            try:
                await self._fetch_and_publish()
            except Exception:
                logger.exception("RepeaterBook fetch error")
            await asyncio.sleep(self.interval_sec)

    async def _fetch_and_publish(self):
        logger.info("Fetching RepeaterBook data (center=%.4f,%.4f radius=%d mi)",
                    CENTER_LAT, CENTER_LON, RB_RADIUS_MI)

        headers = {"User-Agent": "SovereignWatch/1.0 (admin@sovereignwatch.local)"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        params = {
            "lat": CENTER_LAT,
            "lng": CENTER_LON,
            "dist": RB_RADIUS_MI,
            "format": "json",
        }

        async with httpx.AsyncClient(timeout=RB_TIMEOUT, headers=headers) as client:
            resp = await client.get(RB_BASE_URL, params=params)
            resp.raise_for_status()
            raw = resp.json()

        results = raw.get("results") or []
        published = 0

        for entry in results:
            record = self._normalise(entry)
            if record is None:
                continue
            await self.producer.send(self.topic, value=record)
            published += 1

        logger.info("RepeaterBook: published %d sites to %s", published, self.topic)

    def _normalise(self, entry: dict) -> dict | None:
        try:
            lat = float(entry.get("Lat", 0))
            lon = float(entry.get("Long", 0))
        except (TypeError, ValueError):
            return None

        if lat == 0.0 and lon == 0.0:
            return None

        modes = []
        for m in ("FM Analog", "D-Star", "Fusion", "DMR", "P25", "NXDN", "TETRA"):
            v = entry.get(m, "")
            if v and str(v).strip().lower() not in ("", "no", "null", "none"):
                modes.append(m)

        emcomm = []
        for flag, key in [("ARES", "ARES"), ("RACES", "RACES"),
                          ("SKYWARN", "SKYWARN"), ("CERT", "CERT")]:
            v = entry.get(key, "")
            if v and str(v).strip().lower() not in ("", "no", "null", "none"):
                emcomm.append(flag)

        try:
            out_freq = float(entry.get("Frequency", 0))
        except (TypeError, ValueError):
            out_freq = None

        try:
            in_freq = float(entry.get("Input Freq", 0))
        except (TypeError, ValueError):
            in_freq = None

        try:
            ctcss = float(entry.get("PL") or entry.get("CTCSS") or 0) or None
        except (TypeError, ValueError):
            ctcss = None

        callsign = entry.get("Call Sign", "").strip()
        site_id  = f"rb:{callsign}:{entry.get('State','')}"

        return {
            "source":       "repeaterbook",
            "site_id":      site_id,
            "service":      "ham",
            "callsign":     callsign,
            "name":         callsign,
            "lat":          lat,
            "lon":          lon,
            "output_freq":  out_freq,
            "input_freq":   in_freq,
            "tone_ctcss":   ctcss,
            "tone_dcs":     entry.get("DCS"),
            "modes":        modes,
            "use_access":   entry.get("Use", "OPEN"),
            "status":       entry.get("Operational Status", "Unknown"),
            "city":         entry.get("Nearest City", ""),
            "state":        entry.get("State", ""),
            "country":      "US",
            "emcomm_flags": emcomm,
            "meta": {
                "county":   entry.get("County", ""),
                "landmark": entry.get("Landmark", ""),
            },
        }
