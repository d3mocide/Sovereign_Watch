"""
ARD source adapter.
"""

import asyncio
import csv
import io
import logging

import httpx

logger = logging.getLogger("rf_pulse.ard")

ARD_CSV_URL = (
    "https://raw.githubusercontent.com/"
    "ryanwwest/ARD-RepeaterList/main/master.csv"
)
ARD_TIMEOUT = 30.0


class ARDSource:
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
                logger.exception("ARD fetch error")
            await asyncio.sleep(self.interval_sec)

    async def _fetch_and_publish(self):
        logger.info("Fetching ARD master CSV from GitHub")

        async with httpx.AsyncClient(timeout=ARD_TIMEOUT) as client:
            resp = await client.get(ARD_CSV_URL)
            resp.raise_for_status()
            content = resp.text

        reader  = csv.DictReader(io.StringIO(content))
        published = 0

        for row in reader:
            record = self._normalise(row)
            if record is None:
                continue
            await self.producer.send(self.topic, value=record)
            published += 1

        logger.info("ARD: published %d sites to %s", published, self.topic)

    def _normalise(self, row: dict) -> dict | None:
        try:
            lat = float(row.get("Latitude", 0))
            lon = float(row.get("Longitude", 0))
        except (TypeError, ValueError):
            return None

        if lat == 0.0 and lon == 0.0:
            return None

        emcomm = []
        for flag in ("ARES", "RACES", "SKYWARN", "CERT"):
            if row.get(flag, "").strip().upper() in ("Y", "YES", "1", "TRUE"):
                emcomm.append(flag)

        modes = []
        for m in ("FM", "DMR", "P25", "D-Star", "Fusion", "NXDN"):
            if row.get(m, "").strip().upper() in ("Y", "YES", "1", "TRUE"):
                modes.append(m)
        if not modes:
            modes = ["FM"]

        try:
            out_freq = float(row.get("Output", 0)) or None
        except (TypeError, ValueError):
            out_freq = None

        try:
            in_freq = float(row.get("Input", 0)) or None
        except (TypeError, ValueError):
            in_freq = None

        try:
            ctcss = float(row.get("CTCSS", 0)) or None
        except (TypeError, ValueError):
            ctcss = None

        callsign = row.get("Callsign", "").strip()
        state    = row.get("State", "").strip()
        site_id  = f"ard:{callsign}:{state}"

        return {
            "source":       "ard",
            "site_id":      site_id,
            "service":      "ham",
            "callsign":     callsign,
            "name":         callsign,
            "lat":          lat,
            "lon":          lon,
            "output_freq":  out_freq,
            "input_freq":   in_freq,
            "tone_ctcss":   ctcss,
            "tone_dcs":     row.get("DCS", "").strip() or None,
            "modes":        modes,
            "use_access":   row.get("Access", "OPEN"),
            "status":       row.get("Status", "Unknown"),
            "city":         row.get("City", ""),
            "state":        state,
            "country":      "US",
            "emcomm_flags": emcomm,
            "meta": {
                "county":      row.get("County", ""),
                "operational": row.get("Operational", ""),
                "coordinated": row.get("Coordinated", ""),
            },
        }
