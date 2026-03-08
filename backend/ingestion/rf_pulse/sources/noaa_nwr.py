"""
NOAA NWR source adapter.
"""

import asyncio
import logging
import httpx
import re

logger = logging.getLogger("rf_pulse.noaa_nwr")

NOAA_JS_URL = "https://www.weather.gov/source/nwr/JS/CCL.js"
TIMEOUT = 30.0

class NOAANWRSource:
    def __init__(self, producer, redis_client, topic, fetch_interval_h):
        self.producer     = producer
        self.redis_client = redis_client
        self.topic        = topic
        self.interval_sec = fetch_interval_h * 3600

    async def loop(self):
        while True:
            try:
                await self._fetch_and_publish()
            except Exception:
                logger.exception("NOAA NWR fetch error")
            await asyncio.sleep(self.interval_sec)

    async def _fetch_and_publish(self):
        logger.info("NOAA NWR adapter: Fetching data from %s", NOAA_JS_URL)

        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(NOAA_JS_URL)
            resp.raise_for_status()
            content = resp.text

        # Parse the raw JS arrays (SITENAME, CALLSIGN, FREQ, LAT, LON, STATUS)
        # using simple regex. We only care about unique stations by callsign.

        def extract_array(var_name: str) -> dict[int, str]:
            # Matches: var_name[123] = "Value";
            pattern = re.compile(rf'{var_name}\[(\d+)\]\s*=\s*"([^"]*)";')
            return {int(idx): val for idx, val in pattern.findall(content)}

        site_names = extract_array("SITENAME")
        callsigns  = extract_array("CALLSIGN")
        freqs      = extract_array("FREQ")
        lats       = extract_array("LAT")
        lons       = extract_array("LON")
        statuses   = extract_array("STATUS")
        states     = extract_array("SITESTATE")
        cities     = extract_array("SITELOC")

        # The JS file maps SAME county codes so stations repeat for every county they cover.
        # Deduplicate by callsign.
        seen_callsigns = set()
        published = 0

        for idx, callsign in callsigns.items():
            if not callsign or callsign in seen_callsigns:
                continue

            try:
                lat = float(lats.get(idx, 0))
                lon = float(lons.get(idx, 0))
            except (ValueError, TypeError):
                continue

            if lat == 0.0 and lon == 0.0:
                continue

            try:
                freq = float(freqs.get(idx, 0))
            except (ValueError, TypeError):
                freq = None

            site_name = site_names.get(idx, "").strip()
            state = states.get(idx, "")
            city = cities.get(idx, "")
            status = statuses.get(idx, "Unknown")

            seen_callsigns.add(callsign)

            record = {
                "source":       "noaa_nwr",
                "site_id":      f"noaa:{callsign}",
                "service":      "noaa_nwr",
                "callsign":     callsign,
                "name":         site_name,
                "lat":          lat,
                "lon":          lon,
                "output_freq":  freq,
                "input_freq":   None,
                "tone_ctcss":   None,
                "tone_dcs":     None,
                "modes":        ["FM Analog"],
                "use_access":   "OPEN",
                "status":       status,
                "city":         city,
                "state":        state,
                "country":      "US",
                "emcomm_flags": [],
                "meta": {}
            }

            await self.producer.send(self.topic, value=record)
            published += 1

        logger.info("NOAA NWR: published %d unique transmitter sites to %s", published, self.topic)
