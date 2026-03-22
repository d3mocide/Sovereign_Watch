"""
SatNOGS DB source adapter.

Fetches the active transmitter catalog from the SatNOGS satellite database
(db.satnogs.org). Each record maps a NORAD ID to its expected downlink/uplink
frequencies and modulation mode — the ground truth for spectrum verification.

API: https://db.satnogs.org/api/transmitters/?format=json&status=active
     Returns paginated JSON; follows `next` links until exhausted.
"""

import asyncio
import logging
import time
from datetime import datetime, UTC

import httpx

logger = logging.getLogger("space_pulse.db")

SATNOGS_DB_BASE  = "https://db.satnogs.org/api"
TRANSMITTERS_URL = f"{SATNOGS_DB_BASE}/transmitters/"
TIMEOUT          = 30.0
PAGE_SIZE        = 100   # items per page
USER_AGENT       = "SovereignWatch/1.0 (SatNOGS spectrum verification; admin@sovereignwatch.local)"


class SatNOGSDBSource:
    def __init__(self, producer, redis_client, topic, fetch_interval_h):
        self.producer      = producer
        self.redis_client  = redis_client
        self.topic         = topic
        self.interval_sec  = fetch_interval_h * 3600

    async def run(self):
        while True:
            try:
                last_fetch = await self.redis_client.get("satnogs_pulse:db:last_fetch")
                now = time.time()
                if last_fetch:
                    elapsed = now - float(last_fetch)
                    if elapsed < self.interval_sec:
                        wait_sec = self.interval_sec - elapsed
                        logger.info(
                            "SatNOGS DB: cooldown active (%.1fh / %.1fh). Next in %.1fh.",
                            elapsed / 3600, self.interval_sec / 3600, wait_sec / 3600,
                        )
                        await asyncio.sleep(wait_sec)
                        continue

                await self._fetch_and_publish()
                await self.redis_client.set(
                    "satnogs_pulse:db:last_fetch", str(time.time()),
                    ex=int(self.interval_sec * 2),
                )
            except Exception:
                logger.exception("SatNOGS DB fetch error")
            await asyncio.sleep(self.interval_sec)

    async def _fetch_and_publish(self):
        logger.info("SatNOGS DB: fetching active transmitter catalog")
        fetched_at = datetime.now(UTC).isoformat()
        published  = 0

        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        }
        params = {
            "format": "json",
            "status": "active",
            "page_size": PAGE_SIZE,
        }

        async with httpx.AsyncClient(timeout=TIMEOUT, headers=headers) as client:
            url = TRANSMITTERS_URL
            page = 1
            while url:
                try:
                    resp = await client.get(url, params=params if page == 1 else None)
                    resp.raise_for_status()
                    data = resp.json()
                except httpx.HTTPStatusError as exc:
                    logger.error("SatNOGS DB HTTP %d for %s — aborting page fetch", exc.response.status_code, url)
                    break
                except Exception as exc:
                    logger.error("SatNOGS DB request error on page %d: %s", page, exc)
                    break

                # API returns either a paginated envelope or a plain list
                if isinstance(data, dict):
                    results = data.get("results", [])
                    next_url = data.get("next")
                else:
                    results = data
                    next_url = None

                for tx in results:
                    record = self._normalise(tx, fetched_at)
                    if record is None:
                        continue
                    await self.producer.send(self.topic, value=record)
                    published += 1

                url = next_url
                page += 1
                if url:
                    await asyncio.sleep(0.5)  # polite pacing between pages

        logger.info("SatNOGS DB: published %d transmitter records to %s", published, self.topic)

    def _normalise(self, tx: dict, fetched_at: str) -> dict | None:
        norad_id = tx.get("norad_cat_id")
        if not norad_id:
            return None

        downlink_low  = tx.get("downlink_low")
        downlink_high = tx.get("downlink_high")
        uplink_low    = tx.get("uplink_low")
        uplink_high   = tx.get("uplink_high")

        # Require at least one frequency to be meaningful
        if downlink_low is None and uplink_low is None:
            return None

        return {
            "source":           "satnogs_db",
            "uuid":             tx.get("uuid", ""),
            "norad_id":         str(norad_id),
            "sat_name":         tx.get("sat_name", ""),
            "description":      tx.get("description", ""),
            "alive":            bool(tx.get("alive", False)),
            "type":             tx.get("type", "Transmitter"),
            "uplink_low":       uplink_low,         # Hz
            "uplink_high":      uplink_high,         # Hz
            "downlink_low":     downlink_low,        # Hz
            "downlink_high":    downlink_high,       # Hz
            "mode":             tx.get("mode", ""),
            "invert":           bool(tx.get("invert", False)),
            "baud":             tx.get("baud"),
            "status":           tx.get("status", "active"),
            "fetched_at":       fetched_at,
        }
