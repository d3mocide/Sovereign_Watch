"""
ISS Position Source
===================
Polls the current ISS position and persists to Redis + TimescaleDB.

Primary:  https://api.wheretheiss.at/v1/satellites/25544
Fallback: http://api.open-notify.org/iss-now.json

Rate notes:
  - wheretheiss.at: ~1 req/s soft limit; 429 triggers 30s backoff.
  - open-notify:    ~1 req/s; used only when primary fails.

Poll interval: 5 seconds (matches ISS ~7.7 km/s ground track resolution).
"""
import asyncio
import json
import logging
from datetime import UTC, datetime

import asyncpg

from sources.base import BaseSource

logger = logging.getLogger("space_pulse.iss")

# Rate limit threshold
_RATE_LIMIT_BACKOFF_S = 30

# Primary and fallback ISS position APIs
ISS_PRIMARY_URL  = "https://api.wheretheiss.at/v1/satellites/25544"
ISS_FALLBACK_URL = "http://api.open-notify.org/iss-now.json"

# Primary and fallback ISS position APIs
ISS_PRIMARY_URL  = "https://api.wheretheiss.at/v1/satellites/25544"
ISS_FALLBACK_URL = "http://api.open-notify.org/iss-now.json"


class ISSSource(BaseSource):
    def __init__(self, client, redis_client, db_url):
        super().__init__(client)
        self.redis_client   = redis_client
        self.db_url         = db_url
        self.poll_interval_s = 5
        self._last_lat      = None
        self._last_lon      = None
        self._use_fallback  = False   # toggled when primary is rate-limited

    async def run(self):
        """Main polling loop for ISS position."""
        logger.info(
            "ISS source started (primary=%s, fallback=%s, interval=%ds)",
            ISS_PRIMARY_URL, ISS_FALLBACK_URL, self.poll_interval_s,
        )
        while self.running:
            try:
                await self._poll()
            except Exception as exc:
                logger.error("ISS fetch error: %s", repr(exc))

            await asyncio.sleep(self.poll_interval_s)

    async def _poll(self):
        """Attempt primary; fall back gracefully on rate-limit or error."""
        url = ISS_FALLBACK_URL if self._use_fallback else ISS_PRIMARY_URL

        resp = await self.fetch_with_retry(url, max_retries=1)
        if not resp:
            # If primary is struggling, let the next cycle try fallback
            if not self._use_fallback:
                self._use_fallback = True
            return

        if resp.status_code == 429:
            logger.warning(
                "ISS rate-limited by %s — switching to fallback for %ds",
                url, _RATE_LIMIT_BACKOFF_S,
            )
            self._use_fallback = True
            await asyncio.sleep(_RATE_LIMIT_BACKOFF_S)
            return

        if resp.status_code != 200:
            logger.warning("ISS fetch failed: HTTP %d from %s", resp.status_code, url)
            if not self._use_fallback:
                self._use_fallback = True
            return

        # Success — reset fallback flag so primary is retried next cycle
        self._use_fallback = False
        data = resp.json()

        record = self._parse_response(data, url)
        if record:
            await self._process_record(record)

    def _parse_response(self, data: dict, source_url: str) -> dict | None:
        """Normalise primary (wheretheiss.at) or fallback (open-notify) JSON."""
        try:
            if "open-notify" in source_url:
                # open-notify: {"iss_position": {"latitude": "...", "longitude": "..."}, "timestamp": ...}
                pos = data["iss_position"]
                lat = float(pos["latitude"])
                lon = float(pos["longitude"])
                ts  = int(data["timestamp"])
                alt = 0.0   # open-notify doesn't include altitude
                vel = 0.0
            else:
                # wheretheiss.at: {"latitude": ..., "longitude": ..., "altitude": ..., "velocity": ..., "timestamp": ...}
                lat = float(data["latitude"])
                lon = float(data["longitude"])
                ts  = int(data["timestamp"])
                alt = float(data.get("altitude", 0.0))
                vel = float(data.get("velocity", 0.0))
        except (KeyError, TypeError, ValueError) as exc:
            logger.debug("ISS response parse error: %s | data=%s", repr(exc), data)
            return None

        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            return None

        return {
            "time":         datetime.fromtimestamp(ts, tz=UTC),
            "lat":          lat,
            "lon":          lon,
            "altitude_km":  alt,
            "velocity_kms": vel / 3600.0,  # km/h → km/s
        }

    async def _process_record(self, record: dict):
        # 1. Update Redis (latest position for REST fallback)
        payload = json.dumps({
            "lat":          record["lat"],
            "lon":          record["lon"],
            "timestamp":    int(record["time"].timestamp()),
            "altitude_km":  record["altitude_km"],
            "velocity_kms": record["velocity_kms"],
        })
        await self.redis_client.set("infra:iss_latest", payload, ex=60)

        # 2. Publish to Redis (real-time broadcast layer for WebSockets)
        await self.redis_client.publish("infrastructure:iss-position", payload)

        # 3. Archive to Database (Ground Track history)
        if record["lat"] != self._last_lat or record["lon"] != self._last_lon:
            await self._archive_to_db(record)
            self._last_lat = record["lat"]
            self._last_lon = record["lon"]

        logger.info(
            "ISS: lat=%.4f lon=%.4f alt=%.1f km vel=%.2f km/s",
            record["lat"], record["lon"], record["altitude_km"], record["velocity_kms"],
        )

    async def _archive_to_db(self, record: dict):
        try:
            conn = await asyncpg.connect(self.db_url)
            try:
                await conn.execute(
                    """
                    INSERT INTO iss_positions (time, lat, lon, altitude_km, velocity_kms, geom)
                    VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($3, $2), 4326))
                    ON CONFLICT DO NOTHING
                    """,
                    record["time"],
                    record["lat"],
                    record["lon"],
                    record["altitude_km"],
                    record["velocity_kms"],
                )
            finally:
                await conn.close()
        except Exception as exc:
            logger.error("ISS DB archive error: %s", repr(exc))
