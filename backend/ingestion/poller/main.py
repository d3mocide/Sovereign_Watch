
import asyncio
import logging
import json
import math
import os
import signal
import time

from typing import Dict, List, Optional
from aiokafka import AIOKafkaProducer
from multi_source_poller import MultiSourcePoller
import redis.asyncio as redis

# Config - Read from ENV (set in docker-compose.yml)
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BROKERS", "sovereign-redpanda:9092")
REDIS_URL = f"redis://{os.getenv('REDIS_HOST', 'sovereign-redis')}:6379"
TOPIC_OUT = "adsb_raw"

# Location config - centralized in docker-compose.yml / .env (defaults)
CENTER_LAT = float(os.getenv("CENTER_LAT", "45.5152"))
CENTER_LON = float(os.getenv("CENTER_LON", "-122.6784"))
COVERAGE_RADIUS_NM = int(os.getenv("COVERAGE_RADIUS_NM", "150"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("poller_service")

# ---------------------------------------------------------------------------
# Arbitration cache constants
# ---------------------------------------------------------------------------
# Minimum elapsed source-time before the same hex will be re-published.
# Set to 500ms so the fastest sources (1 req/s each) can only push one
# meaningful update per aircraft every half-second to Kafka.
ARBI_MIN_DELTA_S = 0.5

# Minimum spatial displacement (metres) that always bypasses the time gate.
# Handles the edge case where an aircraft's position changes significantly
# within the same 500ms window (very fast, low-altitude targets).
ARBI_MIN_DIST_M = 50.0

# How long (seconds) to retain an entry in the cache after last publish.
# Entries older than this are evicted to reclaim memory for departed aircraft.
ARBI_TTL_S = 30.0


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in metres between two WGS-84 coordinates."""
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class PollerService:
    def __init__(self):
        self.running = True
        self.poller = MultiSourcePoller()
        self.producer = None
        self.redis_client = None
        self.pubsub = None

        # Dynamic mission area (can be updated via Redis)
        self.center_lat = CENTER_LAT
        self.center_lon = CENTER_LON
        self.radius_nm = COVERAGE_RADIUS_NM

        # Per-hex arbitration cache: hex → {"ts": float, "lat": float, "lon": float, "wall": float}
        # "ts" is the source_ts of the last published message for this hex.
        # "wall" is the local wall-clock time of that publish (for TTL eviction).
        self._arbi_cache: Dict[str, Dict] = {}

    async def setup(self):
        await self.poller.start()
        self.producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP)
        await self.producer.start()
        
        # Connect to Redis for mission area updates
        self.redis_client = await redis.from_url(REDIS_URL, decode_responses=True)
        self.pubsub = self.redis_client.pubsub()
        await self.pubsub.subscribe("navigation-updates")
        
        # Check for existing active mission from Redis
        await self.load_active_mission()
        
        logger.info("Poller service ready")

    async def load_active_mission(self):
        """Load the current active mission area from Redis on startup."""
        mission_json = await self.redis_client.get("mission:active")
        if mission_json:
            mission = json.loads(mission_json)
            self.center_lat = mission["lat"]
            self.center_lon = mission["lon"]
            self.radius_nm = mission["radius_nm"]
            logger.info(f"Loaded active mission: ({self.center_lat}, {self.center_lon}) @ {self.radius_nm}nm")
        else:
            logger.info(f"Using default mission area: ({self.center_lat}, {self.center_lon}) @ {self.radius_nm}nm")

    async def shutdown(self):
        logger.info("Shutting down...")
        self.running = False
        await self.poller.close()
        await self.producer.stop()
        if self.pubsub:
            await self.pubsub.unsubscribe("navigation-updates")
            # aclose() is the new async close method for redis-py 5.x+
            await self.pubsub.aclose() if hasattr(self.pubsub, 'aclose') else await self.pubsub.close()
        if self.redis_client:
            await self.redis_client.aclose() if hasattr(self.redis_client, 'aclose') else await self.redis_client.close()

    def calculate_polling_points(self):
        """Calculate polling coverage points based on current mission area."""
        return [
            (self.center_lat, self.center_lon, self.radius_nm),           # Center
            (self.center_lat + 0.5, self.center_lon - 0.5, min(100, self.radius_nm)),  # NW offset  
            (self.center_lat - 0.5, self.center_lon + 0.5, min(100, self.radius_nm)),  # SE offset
        ]
    
    async def navigation_listener(self):
        """Background task listening for mission area updates from Redis."""
        while self.running:
            try:
                # Re-subscribe if connection was lost
                if not self.pubsub.connection:
                     await self.pubsub.subscribe("navigation-updates")

                async for message in self.pubsub.listen():
                    if not self.running: 
                        break
                        
                    if message["type"] == "message":
                        try:
                            mission = json.loads(message["data"])
                            old_center = (self.center_lat, self.center_lon, self.radius_nm)
                            self.center_lat = mission["lat"]
                            self.center_lon = mission["lon"]
                            self.radius_nm = mission["radius_nm"]
                            logger.info(f"📍 Mission area updated: {old_center} → ({self.center_lat}, {self.center_lon}) @ {self.radius_nm}nm")
                        except Exception as e:
                            logger.error(f"Failed to parse mission update: {e}")
            except (redis.ConnectionError, asyncio.CancelledError):
                if self.running:
                    logger.warning("Redis connection lost in listener. Retrying in 5s...")
                    await asyncio.sleep(5)
                else:
                    break
            except Exception as e:
                logger.error(f"Unexpected error in navigation listener: {e}")
                if self.running:
                    await asyncio.sleep(5)
                else:
                    break

    async def loop(self):
        """Main Event Loop - Dynamic polling based on mission area."""
        logger.info(f"Starting Polling Loop - Center: ({self.center_lat}, {self.center_lon}), Radius: {self.radius_nm}nm")
        
        current_point = 0
        
        while self.running:
            polling_points = self.calculate_polling_points()
            lat, lon, radius = polling_points[current_point]
            current_point = (current_point + 1) % len(polling_points)
            
            await self.process_point(lat, lon, radius)
            
            # Sleep based on source rate limits
            # With 3 sources at 2s each, we can cycle at a sustainable rate.
            # Increased to 2.0s to mitigate upstream rate limiting.
            await asyncio.sleep(2.0) 

    def _evict_stale_arbi_entries(self) -> None:
        """Remove cache entries for aircraft not seen recently to reclaim memory."""
        now = time.time()
        stale = [hex_id for hex_id, entry in self._arbi_cache.items()
                 if now - entry["wall"] > ARBI_TTL_S]
        for hex_id in stale:
            del self._arbi_cache[hex_id]

    def _should_publish(self, hex_id: str, source_ts: float, lat: float, lon: float) -> bool:
        """
        Arbitration gate: return True only if this position update is worth
        publishing to Kafka.

        Rules (any one is sufficient to allow publish):
          1. No prior entry for this hex (first time we've seen it).
          2. source_ts is at least ARBI_MIN_DELTA_S newer than last published ts.
          3. Spatial displacement from last published position exceeds ARBI_MIN_DIST_M
             (catches fast-movers that move a lot within the time window).
        """
        entry = self._arbi_cache.get(hex_id)
        if entry is None:
            return True

        delta_ts = source_ts - entry["ts"]
        if delta_ts >= ARBI_MIN_DELTA_S:
            return True

        dist = _haversine_m(entry["lat"], entry["lon"], lat, lon)
        if dist >= ARBI_MIN_DIST_M:
            return True

        return False

    def _record_publish(self, hex_id: str, source_ts: float, lat: float, lon: float) -> None:
        """Update the arbitration cache after a successful publish."""
        self._arbi_cache[hex_id] = {
            "ts": source_ts,
            "lat": lat,
            "lon": lon,
            "wall": time.time(),
        }

    async def process_point(self, lat: float, lon: float, radius: int):
        """Poll a single point and publish aircraft to Kafka."""
        aircraft = await self.poller.poll_point(lat, lon, radius)

        if not aircraft:
            return

        logger.debug(f"Received {len(aircraft)} aircraft from ({lat:.2f}, {lon:.2f})")

        # Evict stale arbitration entries periodically (cheap — runs per poll cycle)
        self._evict_stale_arbi_entries()

        published = 0
        for ac in aircraft:
            tak_msg = self.normalize_to_tak(ac)
            if not tak_msg:
                continue

            hex_id = tak_msg["uid"]
            source_ts = tak_msg["time"] / 1000.0  # convert ms back to seconds
            msg_lat = tak_msg["point"]["lat"]
            msg_lon = tak_msg["point"]["lon"]

            if not self._should_publish(hex_id, source_ts, msg_lat, msg_lon):
                continue  # Duplicate or too-soon update — skip Kafka publish

            self._record_publish(hex_id, source_ts, msg_lat, msg_lon)

            key = hex_id.encode("utf-8")
            val = json.dumps(tak_msg).encode("utf-8")
            await self.producer.send(TOPIC_OUT, value=val, key=key)
            published += 1

        if published:
            logger.debug(f"Published {published}/{len(aircraft)} aircraft from ({lat:.2f}, {lon:.2f})")

    def normalize_to_tak(self, ac: Dict) -> Optional[Dict]:
        """Convert ADSBx format to SovereignWatch TAK-ish JSON format."""
        # Simple mapping matching aviation_ingest.yaml logic
        if not ac.get("lat") or not ac.get("lon"):
            return None
            
        # Calculate TRUE source time (subtract latency)
        # 'seen_pos' = seconds since position update
        # 'seen' = seconds since any update
        # Anchor to _fetched_at (when HTTP response arrived) rather than
        # time.time() here, which is later and drifts per-aircraft as the
        # normalization loop runs. This eliminates cross-source timestamp
        # inversions caused by processing lag.
        fetched_at = float(ac.get("_fetched_at") or time.time())
        latency = float(ac.get("seen_pos") or ac.get("seen") or 0.0)
        source_ts = fetched_at - latency
            
        return {
            "uid": ac.get("hex", "").lower(),
            "type": "a-f-A-C-F", # Simplified default
            "how": "m-g",
            "time": source_ts * 1000, # MS timestamp adjusted for age
            # Python time.time() is float seconds. JS/TAK usually likes MS or ISO.
            # Let's use ISO string to be safe or just matching Benthos 'now()'
            # Benthos now() is RFC3339 string.
            "start": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            "stale": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() + 120)),
            "point": {
                "lat": ac.get("lat"),
                "lon": ac.get("lon"),
                "hae": self._parse_altitude(ac),
                "ce": 10.0,
                "le": 10.0
            },
            "detail": {
                "track": {
                    "course": ac.get("track") or 0,
                    "speed": self._safe_float(ac.get("gs")) * 0.514444  # Knots to m/s
                },
                "contact": {
                    "callsign": (ac.get("flight", "") or ac.get("hex", "")).strip()
                }
            }
        }

    def _parse_altitude(self, ac: Dict) -> float:
        """Safely parse altitude from multiple possible keys (baro, geom, alt)."""
        # Try keys in order of preference
        val = ac.get("alt_baro")
        if val is None or val == "ground":
            val = ac.get("alt_geom")
        if val is None or val == "ground":
            val = ac.get("alt")
            
        if val is None or val == "ground":
            return 0.0
        
        try:
            return float(val) * 0.3048  # Feet to Meters
        except (TypeError, ValueError):
            return 0.0


    def _safe_float(self, val, default: float = 0.0) -> float:
        """Safely convert any value to float."""
        if val is None:
            return default
        try:
            return float(val)
        except (TypeError, ValueError):
            return default

if __name__ == "__main__":
    service = PollerService()
    
    # Graceful Shutdown
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(service.shutdown()))
        
    loop.run_until_complete(service.setup())
    try:
        # Run both the polling loop and the navigation listener concurrently
        loop.run_until_complete(asyncio.gather(
            service.loop(),
            service.navigation_listener()
        ))
    except asyncio.CancelledError:
        pass
    finally:
        loop.run_until_complete(service.shutdown())
