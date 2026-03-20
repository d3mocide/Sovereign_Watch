"""
ARD source adapter.
"""

import asyncio
import logging
import time

import httpx

logger = logging.getLogger("rf_pulse.ard")

ARD_CSV_URL = (
    "https://raw.githubusercontent.com/"
    "Amateur-Repeater-Directory/ARD-RepeaterList/refs/heads/main/MasterList/MasterRepeater.json"
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
                last_fetch = await self.redis_client.get("rf_pulse:ard:last_fetch")
                now = time.time()
                if last_fetch:
                    elapsed = now - float(last_fetch)
                    if elapsed < self.interval_sec:
                        wait_sec = self.interval_sec - elapsed
                        logger.info(
                            "ARD: fetch cooldown active (%.1f/%.1f hours). "
                            "Skipping for %.1f hours.",
                            elapsed / 3600, self.interval_sec / 3600, wait_sec / 3600,
                        )
                        await asyncio.sleep(wait_sec)
                        continue

                await self._fetch_and_publish()
                await self.redis_client.set(
                    "rf_pulse:ard:last_fetch", str(time.time()),
                    ex=int(self.interval_sec * 2),
                )
            except Exception:
                logger.exception("ARD fetch error")
            await asyncio.sleep(self.interval_sec)

    async def _fetch_and_publish(self):
        logger.info("Fetching ARD master list from GitHub")

        async with httpx.AsyncClient(timeout=ARD_TIMEOUT) as client:
            resp = await client.get(ARD_CSV_URL)
            resp.raise_for_status()
            data = resp.json()

        published = 0

        for row in data:
            record = self._normalise(row)
            if record is None:
                continue
            await self.producer.send(self.topic, value=record)
            published += 1

        logger.info("ARD: published %d sites to %s", published, self.topic)

    def _normalise(self, row: dict) -> dict | None:
        try:
            lat = float(row.get("latitude", 0) or 0)
            lon = float(row.get("longitude", 0) or 0)
        except (TypeError, ValueError):
            return None

        if lat == 0.0 and lon == 0.0:
            return None

        emcomm = []
        for flag in ("ares", "races", "skywarn", "cert"):
            if row.get(flag) is True:
                emcomm.append(flag.upper())

        modes = ["FM"]  # Default given JSON schema
        
        try:
            out_freq = float(row.get("outputFrequency", 0)) or None
        except (TypeError, ValueError):
            out_freq = None

        try:
            in_freq = float(row.get("inputFrequency", 0)) or None
        except (TypeError, ValueError):
            in_freq = None

        try:
            ctcss = float(row.get("ctcssTx", 0)) or None
        except (TypeError, ValueError):
            ctcss = None

        callsign = row.get("callsign", "").strip() if row.get("callsign") else ""
        state    = row.get("state", "").strip() if row.get("state") else ""
        site_id  = row.get("repeaterId", f"ard:{callsign}:{state}")

        is_open = row.get("isOpen", False)
        is_operational = row.get("isOperational", True)
        
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
            "tone_dcs":     row.get("dcs", ""),
            "modes":        modes,
            "use_access":   "OPEN" if is_open else "CLOSED",
            "status":       "On-air" if is_operational else "Off-air",
            "city":         row.get("nearestCity", ""),
            "state":        state,
            "country":      "US",
            "emcomm_flags": emcomm,
            "meta": {
                "county":      row.get("county", ""),
                "operational": is_operational,
                "coordinated": row.get("isCoordinated", False),
            },
        }
