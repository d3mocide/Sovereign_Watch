import asyncio
import logging
import json
import os
import time
from typing import Dict, List, Optional
from aiokafka import AIOKafkaProducer
import redis.asyncio as redis

from multi_source_poller import MultiSourcePoller
from classification import classify_aircraft
from arbitration import Arbitrator
from utils import safe_float, parse_altitude
from h3_sharding import H3PriorityManager

# Config - Read from ENV (set in docker-compose.yml)
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BROKERS", "sovereign-redpanda:9092")
REDIS_URL = f"redis://{os.getenv('REDIS_HOST', 'sovereign-redis')}:6379"
TOPIC_OUT = "adsb_raw"

# Location config - centralized in docker-compose.yml / .env (defaults)
CENTER_LAT = float(os.getenv("CENTER_LAT", "45.5152"))
CENTER_LON = float(os.getenv("CENTER_LON", "-122.6784"))
COVERAGE_RADIUS_NM = int(os.getenv("COVERAGE_RADIUS_NM", "150"))

# Cleanup config
ARBITRATION_CLEANUP_INTERVAL = int(os.getenv("ARBITRATION_CLEANUP_INTERVAL", "30"))

logger = logging.getLogger("poller_service")

class PollerService:
    def __init__(self):
        self.running = True
        self.poller = MultiSourcePoller()
        self.producer = None
        self.redis_client = None
        self.pubsub = None
        self.arbitrator = Arbitrator()

        # Dynamic mission area (can be updated via Redis)
        self.center_lat = CENTER_LAT
        self.center_lon = CENTER_LON
        self.radius_nm = COVERAGE_RADIUS_NM

        # H3 adaptive polling manager (Ingest-13)
        self.h3_manager = H3PriorityManager(REDIS_URL)

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

        # Start H3 manager and seed the poll queue for the current mission area
        await self.h3_manager.start()
        await self.h3_manager.initialize_region(
            self.center_lat, self.center_lon, self.radius_nm * 1.852
        )

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
        await self.h3_manager.close()
        await self.producer.stop()
        if self.pubsub:
            await self.pubsub.unsubscribe("navigation-updates")
            # aclose() is the new async close method for redis-py 5.x+
            await self.pubsub.aclose() if hasattr(self.pubsub, 'aclose') else await self.pubsub.close()
        if self.redis_client:
            await self.redis_client.aclose() if hasattr(self.redis_client, 'aclose') else await self.redis_client.close()

    def calculate_polling_points(self):
        """Calculate polling coverage points based on current mission area."""
        # Optimization: For small tactical areas (< 50nm), a single point is sufficient
        # and allows for higher update frequency (1.0s vs 3.0s latency).
        if self.radius_nm < 50:
            return [(self.center_lat, self.center_lon, self.radius_nm)]

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
                            # Flush stale cells and re-seed for the new AOR
                            await self.h3_manager.flush_region()
                            await self.h3_manager.initialize_region(
                                self.center_lat, self.center_lon, self.radius_nm * 1.852
                            )
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

    async def source_loop(self, source_idx: int):
        """Independent loop for a specific aviation source, driven by the H3 priority queue."""
        source = self.poller.sources[source_idx]
        logger.info(f"🚀 Started dedicated loop for {source.name}")

        while self.running:
            try:
                cells = await self.h3_manager.get_next_batch(batch_size=1)
                if not cells:
                    await asyncio.sleep(1)
                    continue

                cell = cells[0]
                lat, lon, radius = self.h3_manager.get_cell_center_radius(cell)

                # Clamp radius to source-specific maximum to avoid 400 errors
                effective_radius = min(radius, source.max_radius)
                path = source.url_format.format(lat=lat, lon=lon, radius=effective_radius)
                url = f"{source.base_url}{path}"

                try:
                    # BUG-001: Rate limiting is enforced inside _fetch() via the
                    # per-source limiter in multi_source_poller.py. A second
                    # async with source.limiter: here would consume two tokens
                    # per poll, halving the configured rate. Removed.
                    data = await self.poller._fetch(source, url)
                    aircraft = data.get("ac") or data.get("aircraft") or []

                    if aircraft:
                        fetched_at = time.time()
                        for ac in aircraft:
                            ac["_source"] = source.name
                            ac["_fetched_at"] = fetched_at
                        await self.process_aircraft_batch(aircraft, lat, lon)

                    # Update cell priority based on observed traffic.
                    # Use raw count (pre-arbitration) as the activity signal.
                    await self.h3_manager.update_priority(cell, len(aircraft))

                except Exception as e:
                    logger.error(f"Error in {source.name} cycle: {e}")
                    # Note: source.penalize() is already called inside _fetch for 429s
                    # Still update priority so the cell re-enters the queue
                    await self.h3_manager.update_priority(cell, 0)

                # Small sleep to prevent tight-looping
                await asyncio.sleep(0.1)

            except Exception as e:
                logger.error(f"CRITICAL error in {source.name} loop: {e}")
                await asyncio.sleep(5)

    async def loop(self):
        """Main Orchestration Loop - Spawns concurrent source tasks."""
        logger.info(f"Initializing Parallel Ingestion - Center: ({self.center_lat}, {self.center_lon}), Radius: {self.radius_nm}nm")
        
        # Start one independent loop per source
        tasks = []

        # Add background cleanup task
        tasks.append(asyncio.create_task(self.cleanup_loop()))

        for i in range(len(self.poller.sources)):
            # Stagger loop starts slightly to prevent bursty network traffic
            # and synchronized multi-source updates for the same plane.
            delay = i * 0.5 
            tasks.append(asyncio.create_task(self.staggered_start(i, delay)))
            
        # Wait for all (they run until self.running is False)
        await asyncio.gather(*tasks)

    async def cleanup_loop(self):
        """Background task to periodically evict stale arbitration entries."""
        logger.info(f"Starting arbitration cleanup loop (interval: {ARBITRATION_CLEANUP_INTERVAL}s)")
        while self.running:
            try:
                await asyncio.sleep(ARBITRATION_CLEANUP_INTERVAL)
                if not self.running:
                    break

                start = time.time()
                self.arbitrator.evict_stale_entries()
                elapsed = time.time() - start

                # Only log if it takes a significant amount of time (>10ms)
                if elapsed > 0.01:
                    logger.debug(f"Eviction took {elapsed:.4f}s")

            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")
                await asyncio.sleep(5)  # Backoff on error

    async def staggered_start(self, source_idx: int, delay: float):
        """Wait before starting the source loop to stagger update bursts."""
        await asyncio.sleep(delay)
        await self.source_loop(source_idx)

    async def process_aircraft_batch(self, aircraft: List[Dict], lat: float, lon: float):
        """Process and publish a batch of aircraft from a specific source."""
        if not aircraft:
            return

        logger.info(f"Received {len(aircraft)} aircraft from ({lat:.2f}, {lon:.2f})")

        published = 0
        for ac in aircraft:
            tak_msg = self.normalize_to_tak(ac)
            if not tak_msg:
                continue

            hex_id = tak_msg["uid"]
            source_ts = tak_msg["time"] / 1000.0
            msg_lat = tak_msg["point"]["lat"]
            msg_lon = tak_msg["point"]["lon"]

            if not self.arbitrator.should_publish(hex_id, source_ts, msg_lat, msg_lon):
                continue

            self.arbitrator.record_publish(hex_id, source_ts, msg_lat, msg_lon)

            key = hex_id.encode("utf-8")
            val = json.dumps(tak_msg).encode("utf-8")
            await self.producer.send(TOPIC_OUT, value=val, key=key)
            published += 1

        if published:
            logger.info(f"Published {published}/{len(aircraft)} aircraft from ({lat:.2f}, {lon:.2f})")

    def normalize_to_tak(self, ac: Dict) -> Optional[Dict]:
        """Convert ADSBx format to SovereignWatch TAK-ish JSON format."""
        
        # Extract category locally for mapping scope
        category = ac.get("category", "")
        
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
            
        target_class = classify_aircraft(ac)
        
        # Derive CoT Type String based on classification
        # Default: "a-f-A-C-F" (Friendly - Air - Civilian - Fixed Wing)
        cot_type = "a-f-A-C-F"
        
        affil_code = "C" # Civilian
        plat_code = "F" # Fixed Wing
        
        if target_class["affiliation"] == "military":
            affil_code = "M"
        
        if target_class["platform"] == "helicopter":
            plat_code = "H"
            
        cot_type = f"a-f-A-{affil_code}-{plat_code}"
        
        # Special case: Ground Vehicles (C1=Emergency, C2=Service, C3=Obstacle)
        # Mapping to Friendly - Ground - Equipment - Vehicle - Civil
        if category == "C1" or category == "C2" or category == "C3":
             cot_type = "a-f-G-E-V-C"

        # Special case: Drone
        if target_class["platform"] == "drone":
             cot_type = f"a-f-A-{affil_code}-Q" # Q is typically drone/RPV in CoT 2525B mapping variants, or use F per spec fallback

        return {
            "uid": ac.get("hex", "").lower(),
            "type": cot_type,
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
                "hae": parse_altitude(ac),
                "ce": 10.0,
                "le": 10.0
            },
            "detail": {
                "track": {
                    "course": ac.get("track") or 0,
                    "speed": safe_float(ac.get("gs")) * 0.514444,  # Knots to m/s
                    "vspeed": safe_float(ac.get("baro_rate") or ac.get("geom_rate") or 0)
                },
                "contact": {
                    "callsign": (ac.get("flight", "") or ac.get("hex", "")).strip()
                },
                "classification": target_class
            }
        }
