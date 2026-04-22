"""
SatNOGS DB source adapter.

Fetches the active transmitter catalog from the SatNOGS satellite database
(db.satnogs.org). Each record maps a NORAD ID to its expected downlink/uplink
frequencies and modulation mode — the ground truth for spectrum verification.

API: https://db.satnogs.org/api/transmitters/?format=json&status=active
     Returns paginated JSON; follows `next` links until exhausted.
"""

import asyncio
import json
import logging
import time
from datetime import datetime, UTC

from sources.base import BaseSource

logger = logging.getLogger("space_pulse.db")

SATNOGS_DB_BASE  = "https://db.satnogs.org/api"
TRANSMITTERS_URL = f"{SATNOGS_DB_BASE}/transmitters/"
TIMEOUT          = 30.0
PAGE_SIZE        = 100   # items per page
USER_AGENT       = "SovereignWatch/1.0 (SatNOGS spectrum verification; admin@sovereignwatch.local)"


class SatNOGSDBSource(BaseSource):
    def __init__(self, client, producer, redis_client, topic, fetch_interval_h, api_token: str | None = None):
        super().__init__(client)
        self.producer      = producer
        self.redis_client  = redis_client
        self.topic         = topic
        self.interval_sec  = fetch_interval_h * 3600
        self.api_token     = api_token

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
            except Exception as e:
                logger.exception("SatNOGS DB fetch error")
                try:
                    await self.redis_client.set(
                        "poller:satnogs_db:last_error",
                        json.dumps({"ts": time.time(), "msg": str(e)}),
                        ex=86400,
                    )
                except Exception as re:
                    logger.debug("Redis error-state write failed: %s", re)
            await asyncio.sleep(self.interval_sec)

    async def _fetch_and_publish(self):
        logger.info("SatNOGS DB: fetching active transmitter catalog")
        fetched_at = datetime.now(UTC).isoformat()
        published  = 0

        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        }
        if self.api_token:
            headers["Authorization"] = f"Token {self.api_token}"

        params = {
            "format": "json",
            "status": "active",
            "page_size": PAGE_SIZE,
        }

        url = TRANSMITTERS_URL
        page = 1
        while url:
            try:
                resp = await self.fetch_with_retry(
                    url, params=params if page == 1 else None, headers=headers
                )
                if not resp:
                    break
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                logger.error("SatNOGS DB request error on page %d: %s", page, repr(exc))
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
                # Anonymous limit is 60/hr (1/min); Authenticated is 240/hr (4/min).
                # We use a conservative 5s for anonymous and 1s for authenticated.
                delay = 1.0 if self.api_token else 5.0
                await asyncio.sleep(delay)

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
