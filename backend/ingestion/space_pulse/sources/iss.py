import asyncio
import json
import logging
from datetime import UTC, datetime

import aiohttp
import asyncpg

logger = logging.getLogger("space_pulse.iss")

ISS_NOW_URL = "https://api.wheretheiss.at/v1/satellites/25544"


class ISSSource:
    def __init__(self, redis_client, db_url):
        self.redis_client = redis_client
        self.db_url = db_url
        self.running = True
        self.poll_interval_s = 5
        self._last_lat = None
        self._last_lon = None

    async def run(self):
        """Main polling loop for ISS position."""
        logger.info("ISS source started (polling %s every %ds)", ISS_NOW_URL, self.poll_interval_s)
        async with aiohttp.ClientSession() as session:
            while self.running:
                try:
                    async with session.get(ISS_NOW_URL, timeout=10) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            record = self._parse_iss_response(data)
                            if record:
                                await self._process_record(record)
                        else:
                            logger.warning("ISS fetch failed: HTTP %d", resp.status)
                except Exception as e:
                    logger.error("ISS fetch error: %s", e)
                
                await asyncio.sleep(self.poll_interval_s)

    def _parse_iss_response(self, data: dict) -> dict | None:
        try:
            lat = float(data["latitude"])
            lon = float(data["longitude"])
            ts = int(data["timestamp"])
            alt = float(data.get("altitude", 0.0))
            vel = float(data.get("velocity", 0.0))
        except (KeyError, TypeError, ValueError):
            return None
            
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            return None
            
        return {
            "time": datetime.fromtimestamp(ts, tz=UTC),
            "lat": lat,
            "lon": lon,
            "altitude_km": alt,
            "velocity_kms": vel / 3600.0,  # Convert km/h to km/s
        }

    async def _process_record(self, record: dict):
        # 1. Update Redis (latest position for REST fallback)
        payload = json.dumps({
            "lat": record["lat"],
            "lon": record["lon"],
            "timestamp": int(record["time"].timestamp()),
            "altitude_km": record["altitude_km"],
            "velocity_kms": record["velocity_kms"],
        })
        await self.redis_client.set("infra:iss_latest", payload, ex=60)

        # 2. Publish to Redis (real-time broadcast layer for WebSockets)
        await self.redis_client.publish("infrastructure:iss-position", payload)

        # 3. Archive to Database (Ground Track history)
        # Only archive if the position has moved reasonably or 5s have passed
        if record["lat"] != self._last_lat or record["lon"] != self._last_lon:
            await self._archive_to_db(record)
            self._last_lat = record["lat"]
            self._last_lon = record["lon"]

        logger.info("ISS: lat=%.4f lon=%.4f alt=%.1f km vel=%.2f km/s", 
                    record["lat"], record["lon"], record["altitude_km"], record["velocity_kms"])

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
                    record["velocity_kms"]
                )
            finally:
                await conn.close()
        except Exception as e:
            logger.error("ISS DB archive error: %s", e)
