import asyncio
import json
import logging
import os
import time
from typing import Dict, List, Optional, Set

import redis.asyncio as redis
from aiokafka import AIOKafkaProducer
from arbitration import Arbitrator
from classification import classify_aircraft
from h3_sharding import H3PriorityManager
from jamming import JammingAnalyzer
from multi_source_poller import MultiSourcePoller
from opensky_client import OpenSkyClient, nm_radius_to_bbox
from opensky_watchlist import WatchlistManager
from utils import parse_altitude, safe_float

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

# OpenSky config (optional supplemental source)
OPENSKY_ENABLED = os.getenv("OPENSKY_ENABLED", "false").lower() == "true"
OPENSKY_CLIENT_ID = os.getenv("OPENSKY_CLIENT_ID", "").strip()
OPENSKY_CLIENT_SECRET = os.getenv("OPENSKY_CLIENT_SECRET", "").strip()
# rate_limit_period override in seconds (0 = use client default)
_OPENSKY_RATE_PERIOD_RAW = os.getenv("OPENSKY_RATE_LIMIT_PERIOD", "0")
OPENSKY_RATE_LIMIT_PERIOD: Optional[float] = (
    float(_OPENSKY_RATE_PERIOD_RAW) if float(_OPENSKY_RATE_PERIOD_RAW) > 0 else None
)
# Separate rate limit for watchlist queries (defaults to same as bbox if not set)
_OPENSKY_WATCHLIST_RATE_PERIOD_RAW = os.getenv(
    "OPENSKY_WATCHLIST_RATE_LIMIT_PERIOD", "0"
)
OPENSKY_WATCHLIST_RATE_LIMIT_PERIOD: Optional[float] = (
    float(_OPENSKY_WATCHLIST_RATE_PERIOD_RAW)
    if float(_OPENSKY_WATCHLIST_RATE_PERIOD_RAW) > 0
    else None
)

# OpenSky watchlist config
# Watchlist can be enabled independently from the bbox loop.
OPENSKY_WATCHLIST_ENABLED = (
    os.getenv("OPENSKY_WATCHLIST_ENABLED", "false").lower() == "true"
)
# Auto-seed: when aircraft of these affiliation types are spotted in the
# primary AOR, automatically add their ICAO24 to the global watchlist so
# they continue to be tracked after they exit the local coverage area.
OPENSKY_WATCHLIST_AUTO_SEED = (
    os.getenv("OPENSKY_WATCHLIST_AUTO_SEED", "true").lower() == "true"
)
# Comma-separated affiliation types to auto-seed (classify_aircraft affiliation field)
_SEED_TYPES_RAW = os.getenv("OPENSKY_WATCHLIST_SEED_TYPES", "military,government,drone")
OPENSKY_WATCHLIST_SEED_TYPES: Set[str] = {
    t.strip() for t in _SEED_TYPES_RAW.split(",") if t.strip()
}
# TTL for auto-seeded entries (0 = permanent)
_WATCHLIST_TTL_RAW = float(os.getenv("OPENSKY_WATCHLIST_TTL_DAYS", "7"))
OPENSKY_WATCHLIST_TTL_SECONDS: Optional[float] = (
    _WATCHLIST_TTL_RAW * 86_400 if _WATCHLIST_TTL_RAW > 0 else None
)
# How many ICAO24s to include per watchlist API request
OPENSKY_WATCHLIST_BATCH_SIZE = int(os.getenv("OPENSKY_WATCHLIST_BATCH_SIZE", "100"))

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

        # Optional OpenSky client — created if bbox loop OR watchlist is enabled
        _opensky_needed = OPENSKY_ENABLED or OPENSKY_WATCHLIST_ENABLED
        self.opensky_client: Optional[OpenSkyClient] = (
            OpenSkyClient(
                client_id=OPENSKY_CLIENT_ID,
                client_secret=OPENSKY_CLIENT_SECRET,
                rate_limit_period=OPENSKY_RATE_LIMIT_PERIOD,
                watchlist_rate_limit_period=OPENSKY_WATCHLIST_RATE_LIMIT_PERIOD,
            )
            if _opensky_needed
            else None
        )

        # Optional watchlist manager
        self.watchlist: Optional[WatchlistManager] = (
            WatchlistManager(
                redis_url=REDIS_URL,
                default_ttl_seconds=OPENSKY_WATCHLIST_TTL_SECONDS,
            )
            if OPENSKY_WATCHLIST_ENABLED
            else None
        )

        # GPS jamming/integrity analyzer (Ingest-04)
        self.jamming_analyzer = JammingAnalyzer(REDIS_URL)
        self._last_jamming_analysis = 0.0
        self._jamming_analysis_interval = 30.0  # Analyze every 30 seconds

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

        # Start optional OpenSky client
        if self.opensky_client:
            await self.opensky_client.start()
            modes = []
            if OPENSKY_ENABLED:
                modes.append("bbox")
            if OPENSKY_WATCHLIST_ENABLED:
                auto = "auto-seed" if OPENSKY_WATCHLIST_AUTO_SEED else "manual"
                modes.append(f"watchlist({auto})")
            logger.info("OpenSky enabled: %s", ", ".join(modes))
        else:
            logger.info(
                "OpenSky disabled (set OPENSKY_ENABLED or OPENSKY_WATCHLIST_ENABLED)"
            )

        # Start optional watchlist manager
        if self.watchlist:
            await self.watchlist.start()

        # Start H3 manager and seed the poll queue for the current mission area
        await self.h3_manager.start()
        await self.h3_manager.initialize_region(
            self.center_lat, self.center_lon, self.radius_nm * 1.852
        )

        # Start jamming analyzer
        await self.jamming_analyzer.start()

        logger.info("Poller service ready")

    async def load_active_mission(self):
        """Load the current active mission area from Redis on startup."""
        mission_json = await self.redis_client.get("mission:active")
        if mission_json:
            mission = json.loads(mission_json)
            self.center_lat = mission["lat"]
            self.center_lon = mission["lon"]
            self.radius_nm = mission["radius_nm"]
            logger.info(
                f"Loaded active mission: ({self.center_lat}, {self.center_lon}) @ {self.radius_nm}nm"
            )
        else:
            logger.info(
                f"Using default mission area: ({self.center_lat}, {self.center_lon}) @ {self.radius_nm}nm"
            )

    async def shutdown(self):
        logger.info("Shutting down...")
        self.running = False
        await self.poller.close()
        if self.opensky_client:
            await self.opensky_client.close()
        if self.watchlist:
            await self.watchlist.close()
        await self.h3_manager.close()
        await self.jamming_analyzer.close()
        await self.producer.stop()
        if self.pubsub:
            await self.pubsub.unsubscribe("navigation-updates")
            await self.pubsub.aclose()
        if self.redis_client:
            await self.redis_client.aclose()

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
                            old_center = (
                                self.center_lat,
                                self.center_lon,
                                self.radius_nm,
                            )
                            self.center_lat = mission["lat"]
                            self.center_lon = mission["lon"]
                            self.radius_nm = mission["radius_nm"]
                            logger.info(
                                f"📍 Mission area updated: {old_center} → ({self.center_lat}, {self.center_lon}) @ {self.radius_nm}nm"
                            )
                            # Flush stale cells and re-seed for the new AOR
                            await self.h3_manager.flush_region()
                            await self.h3_manager.initialize_region(
                                self.center_lat, self.center_lon, self.radius_nm * 1.852
                            )
                        except Exception as e:
                            logger.error(f"Failed to parse mission update: {e}")
            except (redis.ConnectionError, asyncio.CancelledError):
                if self.running:
                    logger.warning(
                        "Redis connection lost in listener. Retrying in 5s..."
                    )
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
                path = source.url_format.format(
                    lat=lat, lon=lon, radius=effective_radius
                )
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
                        # Throttled heartbeat: update at most once per 30s
                        if fetched_at - getattr(self, "_adsb_last_heartbeat", 0) >= 30:
                            self._adsb_last_heartbeat = fetched_at
                            try:
                                await self.redis_client.set(
                                    "adsb:last_fetch", str(fetched_at), ex=600
                                )
                            except Exception:
                                pass

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
                try:
                    await self.redis_client.set(
                        "poller:adsb:last_error",
                        json.dumps({"ts": time.time(), "msg": str(e)}),
                        ex=86400,
                    )
                except Exception:
                    pass
                await asyncio.sleep(5)

    async def opensky_loop(self):
        """
        Independent polling loop for the OpenSky Network bbox source.

        Unlike the H3-sharded ADSBx loops, OpenSky uses a single bounding-box
        query that covers the entire mission AOR at once.  The loop fires at
        the pace of OpenSkyClient._limiter (rate_limit_period), which is set
        conservatively so the daily credit budget is never exhausted:

          - Authenticated (CLIENT_ID + SECRET set): ~1 req / 22 s
          - Anonymous  (no credentials):            ~1 req / 300 s

        Aircraft returned by fetch_bbox() are already in ADSBx-compatible dict
        format (see opensky_client.translate_state_vector) and flow straight
        into process_aircraft_batch() → arbitrator → Kafka.
        """
        if not self.opensky_client or not OPENSKY_ENABLED:
            return

        logger.info("OpenSky bbox loop started")

        while self.running:
            try:
                if not self.opensky_client.is_healthy():
                    wait = max(0.0, self.opensky_client.cooldown_until - time.time())
                    logger.debug("opensky in cooldown — waiting %.0fs", wait)
                    await asyncio.sleep(min(wait, 30.0))
                    continue

                lamin, lomin, lamax, lomax = nm_radius_to_bbox(
                    self.center_lat, self.center_lon, self.radius_nm
                )

                aircraft = await self.opensky_client.fetch_bbox(
                    lamin, lomin, lamax, lomax
                )

                if aircraft:
                    await self.process_aircraft_batch(
                        aircraft, self.center_lat, self.center_lon
                    )

            except Exception as exc:
                logger.error("opensky_loop error: %s", exc)
                await asyncio.sleep(5)

    async def opensky_watchlist_loop(self):
        """
        Global aircraft tracking loop driven by the ICAO24 watchlist.

        On each cycle this loop:
          1. Reads the active ICAO24 list from Redis (WatchlistManager.get_active)
          2. Splits it into batches of OPENSKY_WATCHLIST_BATCH_SIZE entries
          3. Calls fetch_icao_list() for each batch — no bbox restriction,
             so tracked aircraft are found anywhere in the world
          4. Routes results through the normal process_aircraft_batch pipeline

        Rate limiting is shared with opensky_loop() via the same
        OpenSkyClient._limiter, so both loops together respect the daily budget.

        The loop rotates through batches across successive iterations rather
        than fetching every batch in a single burst.  This keeps latency low
        for large watchlists while honoring the rate limit.
        """
        if not self.opensky_client or not self.watchlist:
            return

        logger.info("OpenSky watchlist loop started")
        batch_cursor = 0

        while self.running:
            try:
                if not self.opensky_client.is_healthy():
                    wait = max(0.0, self.opensky_client.cooldown_until - time.time())
                    await asyncio.sleep(min(wait, 30.0))
                    continue

                icao_list = await self.watchlist.get_active()
                if not icao_list:
                    # Nothing to track; sleep briefly and check again
                    await asyncio.sleep(10)
                    continue

                # Rotate through batches one at a time, resuming where we left
                # off each iteration so the full watchlist cycles evenly.
                batch_size = OPENSKY_WATCHLIST_BATCH_SIZE
                num_batches = max(1, (len(icao_list) + batch_size - 1) // batch_size)
                batch_cursor = batch_cursor % num_batches
                start = batch_cursor * batch_size
                batch = icao_list[start : start + batch_size]
                batch_cursor += 1

                aircraft = await self.opensky_client.fetch_icao_list(batch)
                if aircraft:
                    # Pass (0, 0) as dummy lat/lon — watchlist contacts are
                    # global so there's no meaningful "query center".
                    await self.process_aircraft_batch(aircraft, 0.0, 0.0)
                    logger.info(
                        "Watchlist batch %d/%d: %d/%d contacts airborne",
                        batch_cursor,
                        num_batches,
                        len(aircraft),
                        len(batch),
                    )

            except Exception as exc:
                logger.error("opensky_watchlist_loop error: %s", exc)
                await asyncio.sleep(5)

    async def _maybe_seed_watchlist(self, tak_msg: Dict) -> None:
        """
        Auto-add high-interest aircraft to the global watchlist.

        Called after normalization inside process_aircraft_batch().  Only runs
        when OPENSKY_WATCHLIST_AUTO_SEED is True and the watchlist is enabled.
        Aircraft whose classified affiliation matches OPENSKY_WATCHLIST_SEED_TYPES
        (default: military, government, drone) are added with the configured TTL.
        """
        if not self.watchlist or not OPENSKY_WATCHLIST_AUTO_SEED:
            return

        affiliation = (
            tak_msg.get("detail", {}).get("classification", {}).get("affiliation", "")
        )
        if affiliation in OPENSKY_WATCHLIST_SEED_TYPES:
            icao24 = tak_msg["uid"]
            await self.watchlist.add(icao24)
            logger.debug("Watchlist auto-seeded: %s (%s)", icao24, affiliation)

    async def loop(self):
        """Main Orchestration Loop - Spawns concurrent source tasks."""
        logger.info(
            f"Initializing Parallel Ingestion - Center: ({self.center_lat}, {self.center_lon}), Radius: {self.radius_nm}nm"
        )

        # Start one independent loop per source
        tasks = []

        # Add background cleanup task
        tasks.append(asyncio.create_task(self.cleanup_loop()))

        # Add optional OpenSky bbox loop
        if self.opensky_client and OPENSKY_ENABLED:
            tasks.append(asyncio.create_task(self.opensky_loop()))

        # Add optional OpenSky watchlist loop
        if self.opensky_client and OPENSKY_WATCHLIST_ENABLED:
            tasks.append(asyncio.create_task(self.opensky_watchlist_loop()))

        for i in range(len(self.poller.sources)):
            # Stagger loop starts slightly to prevent bursty network traffic
            # and synchronized multi-source updates for the same plane.
            delay = i * 0.5
            tasks.append(asyncio.create_task(self.staggered_start(i, delay)))

        # Wait for all (they run until self.running is False)
        await asyncio.gather(*tasks)

    async def cleanup_loop(self):
        """Background task to periodically evict stale arbitration and watchlist entries."""
        logger.info(
            f"Starting cleanup loop (interval: {ARBITRATION_CLEANUP_INTERVAL}s)"
        )
        while self.running:
            try:
                await asyncio.sleep(ARBITRATION_CLEANUP_INTERVAL)
                if not self.running:
                    break

                start = time.time()
                self.arbitrator.evict_stale_entries()
                if self.watchlist:
                    await self.watchlist.cleanup_expired()
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

    async def process_aircraft_batch(
        self, aircraft: List[Dict], lat: float, lon: float
    ):
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

            # Feed integrity fields into jamming analyzer
            nic = tak_msg.get("detail", {}).get("classification", {}).get("nic")
            nacp = tak_msg.get("detail", {}).get("classification", {}).get("nacP")
            if nic is not None or nacp is not None:
                self.jamming_analyzer.ingest(
                    uid=hex_id,
                    lat=msg_lat,
                    lon=msg_lon,
                    nic=nic,
                    nacp=nacp,
                )

            # Auto-seed watchlist for high-interest aircraft spotted in any source
            await self._maybe_seed_watchlist(tak_msg)

            key = hex_id.encode("utf-8")
            val = json.dumps(tak_msg).encode("utf-8")
            await self.producer.send(TOPIC_OUT, value=val, key=key)
            published += 1

        if published:
            logger.info(
                f"Published {published}/{len(aircraft)} aircraft from ({lat:.2f}, {lon:.2f})"
            )

        # Run jamming analysis periodically (every 30 s), not per-batch
        now = time.time()
        if now - self._last_jamming_analysis >= self._jamming_analysis_interval:
            try:
                await self.jamming_analyzer.analyze_and_publish()
            except Exception as e:
                logger.error("Jamming analysis error: %s", e)
            self._last_jamming_analysis = now

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

        affil_code = "C"  # Civilian
        plat_code = "F"  # Fixed Wing

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
            cot_type = f"a-f-A-{affil_code}-Q"  # Q is typically drone/RPV in CoT 2525B mapping variants, or use F per spec fallback

        return {
            "uid": ac.get("hex", "").lower(),
            "_source": ac.get("_source", ""),
            "type": cot_type,
            "how": "m-g",
            "time": source_ts * 1000,  # MS timestamp adjusted for age
            # Python time.time() is float seconds. JS/TAK usually likes MS or ISO.
            # Let's use ISO string to be safe or just matching Benthos 'now()'
            # Benthos now() is RFC3339 string.
            "start": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "stale": time.strftime(
                "%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 120)
            ),
            "point": {
                "lat": ac.get("lat"),
                "lon": ac.get("lon"),
                "hae": parse_altitude(ac),
                "ce": 10.0,
                "le": 10.0,
            },
            "detail": {
                "track": {
                    "course": ac.get("track") or 0,
                    "speed": safe_float(ac.get("gs")) * 0.514444,  # Knots to m/s
                    "vspeed": safe_float(
                        ac.get("baro_rate") or ac.get("geom_rate") or 0
                    ),
                },
                "contact": {
                    "callsign": (ac.get("flight", "") or ac.get("hex", "")).strip()
                },
                "classification": {
                    **target_class,
                    # ADS-B integrity fields (NIC/NACp) — present in adsb.fi and adsb.lol feeds.
                    # NIC  0-11: Navigation Integrity Category (higher = tighter containment radius)
                    # NACp 0-11: Navigation Accuracy Category for Position (higher = better accuracy)
                    # Missing (None) means the source did not provide the field.
                    "nic": int(ac["nic"]) if ac.get("nic") is not None else None,
                    "nacP": int(ac["nac_p"]) if ac.get("nac_p") is not None else None,
                },
            },
        }
