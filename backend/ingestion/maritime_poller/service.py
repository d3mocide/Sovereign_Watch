import asyncio
import json
import logging
import os
import random
from datetime import datetime, timedelta
from typing import Optional, Dict

import redis.asyncio as redis
import websockets
import websockets.exceptions
from aiokafka import AIOKafkaProducer

from classification import classify_vessel
from utils import calculate_bbox, calculate_distance_nm

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Environment Variables
AISSTREAM_API_KEY = os.getenv("AISSTREAM_API_KEY", "")
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "sovereign-redpanda:9092")
REDIS_HOST = os.getenv("REDIS_HOST", "sovereign-redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_URL = f"redis://{REDIS_HOST}:{REDIS_PORT}"

# Default Mission Area (Portland, OR - 150nm radius)
CENTER_LAT = float(os.getenv("CENTER_LAT", "45.5152"))
CENTER_LON = float(os.getenv("CENTER_LON", "-122.6784"))
COVERAGE_RADIUS_NM = int(os.getenv("COVERAGE_RADIUS_NM", "150"))


# BUG-019: 511 is the AIS "not available" sentinel for TrueHeading per ITU-R M.1371.
# Define as a named constant so usage sites are self-documenting.
AIS_HEADING_NOT_AVAILABLE = 511


# AISStream Reconnection Stability Constants
MIN_LAT_LON_CHANGE_DEG = 0.05  # ~3nm at mid-latitudes
BBOX_DEBOUNCE_SECONDS = 5.0

# Rate Limit Mitigations
MIN_RECONNECT_INTERVAL_SECONDS = 30.0  # Minimum time between ANY reconnection
BACKOFF_INITIAL_DELAY_SECONDS = 5.0
BACKOFF_MAX_DELAY_SECONDS = 300.0
BACKOFF_FACTOR = 2.0
CONNECTION_STABILITY_THRESHOLD_SECONDS = 60.0 # Time connected to reset backoff


class MaritimePollerService:
    def __init__(self):
        self.running = True
        self.center_lat = CENTER_LAT
        self.center_lon = CENTER_LON
        self.radius_nm = COVERAGE_RADIUS_NM

        self.kafka_producer: Optional[AIOKafkaProducer] = None
        self.redis_client: Optional[redis.Redis] = None
        self.pubsub: Optional[redis.client.PubSub] = None
        self.ws: Optional[websockets.WebSocketClientProtocol] = None

        # Stability & Backoff State
        self.last_reconnect_time: Optional[datetime] = None
        self.reconnect_attempts = 0
        self.connection_start_time: Optional[datetime] = None
        
        self.bbox_update_needed = False
        self._bbox_debounce_task: Optional[asyncio.Task] = None
        self.vessel_static_cache: Dict[int, dict] = {}

    async def setup(self):
        """Initialize Kafka producer and Redis client."""
        # Kafka Producer
        self.kafka_producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BROKERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8")
        )
        await self.kafka_producer.start()
        logger.info(f"📡 Kafka producer connected to {KAFKA_BROKERS}")

        # Redis Client for mission area updates
        self.redis_client = await redis.from_url(REDIS_URL, decode_responses=True)
        self.pubsub = self.redis_client.pubsub()
        await self.pubsub.subscribe("navigation-updates")
        logger.info(f"📡 Redis pub/sub subscribed to navigation-updates")

        # Load active mission from Redis if exists
        await self.load_active_mission()

    async def load_active_mission(self):
        """Load the active mission area from Redis on startup."""
        try:
            mission_json = await self.redis_client.get("mission:active")
            if mission_json:
                mission = json.loads(mission_json)
                self.center_lat = mission["lat"]
                self.center_lon = mission["lon"]
                self.radius_nm = mission["radius_nm"]
                logger.info(f"🗺️ Loaded active mission: ({self.center_lat}, {self.center_lon}) @ {self.radius_nm}nm")
        except Exception as e:
            logger.warning(f"Could not load active mission from Redis: {e}")

    async def shutdown(self):
        """Gracefully shutdown all connections."""
        self.running = False

        if self.ws:
            await self.ws.close()
        if self.kafka_producer:
            await self.kafka_producer.stop()
        if self.pubsub:
            await self.pubsub.unsubscribe("navigation-updates")
            await self.pubsub.aclose() if hasattr(self.pubsub, 'aclose') else await self.pubsub.close()
        if self.redis_client:
            await self.redis_client.aclose() if hasattr(self.redis_client, 'aclose') else await self.redis_client.close()

        logger.info("🛑 Maritime poller shutdown complete")

    async def _schedule_bbox_reconnect(self):
        """Debounced helper: waits BBOX_DEBOUNCE_SECONDS, then signals a reconnect."""
        await asyncio.sleep(BBOX_DEBOUNCE_SECONDS)
        logger.info(f"🔄 Bbox debounce elapsed — scheduling AISStream reconnect")
        self.bbox_update_needed = True

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
                            new_lat = mission["lat"]
                            new_lon = mission["lon"]
                            new_radius = mission["radius_nm"]

                            # ── Minimum-change threshold ──────────────────────────────────
                            # Ignore updates that are just floating-point drift or identical
                            # preset re-selections; only reconnect when the area actually moves.
                            # We deliberately exclude radius changes here so we don't reconnect
                            # to AISStream when the user just changes their display radius.
                            lat_diff = abs(new_lat - self.center_lat)
                            lon_diff = abs(new_lon - self.center_lon)

                            # Always update the local radius so the stream_loop filter catches it
                            self.radius_nm = new_radius

                            if (lat_diff < MIN_LAT_LON_CHANGE_DEG and
                                    lon_diff < MIN_LAT_LON_CHANGE_DEG):
                                logger.debug(
                                    f"📍 Mission center update below threshold — ignoring reconnect "
                                    f"(Δlat={lat_diff:.4f}° Δlon={lon_diff:.4f}°). New filter radius: {self.radius_nm}nm"
                                )
                                continue

                            old_center = (self.center_lat, self.center_lon, self.radius_nm)
                            self.center_lat = new_lat
                            self.center_lon = new_lon
                            self.radius_nm = new_radius

                            logger.info(
                                f"📍 Mission area updated: {old_center} → "
                                f"({self.center_lat}, {self.center_lon}) @ {self.radius_nm}nm"
                            )

                            # ── Debounce ──────────────────────────────────────────────────
                            # Cancel any pending reconnect, then schedule a fresh one.
                            # Rapid preset clicks collapse into a single reconnect.
                            if self._bbox_debounce_task and not self._bbox_debounce_task.done():
                                self._bbox_debounce_task.cancel()
                                logger.debug("🕐 Debounce reset — new mission update received")

                            self._bbox_debounce_task = asyncio.create_task(
                                self._schedule_bbox_reconnect()
                            )

                        except Exception as e:
                            logger.error(f"Failed to parse mission update: {e}")
            except asyncio.CancelledError:
                logger.info("Navigation listener cancelled")
                break
            except Exception as e:
                logger.error(f"Error in navigation listener: {e}")
                if self.running:
                    await asyncio.sleep(5)
                else:
                    break

    async def connect_aisstream(self):
        """Connect to AISStream.io WebSocket and subscribe with a MAX bounding box."""
        # Always use a 350nm bounding box for the actual stream connection to prevent 
        # frequent disconnects when the user just zooms/pans locally.
        bbox = calculate_bbox(self.center_lat, self.center_lon, 350)
        subscription_message = {
            "APIKey": AISSTREAM_API_KEY,
            "BoundingBoxes": [bbox],
            "FilterMessageTypes": [
                "PositionReport",
                "ShipStaticData",
                "StandardClassBPositionReport",
                "StaticDataReport"
            ]
        }

        logger.info(f"🌊 Connecting to AISStream.io with bbox: {bbox}")

        try:
            self.ws = await websockets.connect(
                "wss://stream.aisstream.io/v0/stream",
                open_timeout=30,
                ping_interval=20,
                ping_timeout=20
            )
            await self.ws.send(json.dumps(subscription_message))
            logger.info("✅ AISStream.io connection established")
            return True
        except asyncio.TimeoutError:
            logger.error("❌ AISStream.io connection timed out during handshake")
            return False
        except Exception as e:
            logger.error(f"❌ Failed to connect to AISStream.io: {e}")
            return False

    def handle_static_data(self, mmsi: int, msg: dict):
        """Process ShipStaticData or StaticDataReport to populate cache."""
        if mmsi not in self.vessel_static_cache:
            self.vessel_static_cache[mmsi] = {}

        cache = self.vessel_static_cache[mmsi]

        if "Type" in msg: cache["type"] = msg["Type"]
        if "ImoNumber" in msg: cache["imo"] = msg["ImoNumber"]
        if "CallSign" in msg: cache["callsign"] = msg["CallSign"]
        if "Name" in msg: cache["name"] = msg["Name"].strip()

        if "Dimension" in msg:
            dim = msg["Dimension"]
            cache["dimension_a"] = dim.get("A", 0)
            cache["dimension_b"] = dim.get("B", 0)
            cache["dimension_c"] = dim.get("C", 0)
            cache["dimension_d"] = dim.get("D", 0)

        if "MaximumStaticDraught" in msg: cache["draught"] = msg["MaximumStaticDraught"]
        if "Destination" in msg: cache["destination"] = msg["Destination"].strip()
        if "Eta" in msg: cache["eta"] = msg["Eta"]
        if "FixType" in msg: cache["fix_type"] = msg["FixType"]

        cache["last_seen"] = datetime.utcnow()
        name = cache.get("name", "Unknown")
        ship_type = cache.get("type", 0)
        logger.debug(f"Static data cached for MMSI {mmsi}: {name} type={ship_type}")

    def handle_class_b_position(self, ais_message: dict) -> dict:
        """Transform Class B position report."""
        try:
            msg = ais_message["Message"]["StandardClassBPositionReport"]
            meta = ais_message["MetaData"]
            mmsi = meta["MMSI"]

            now = datetime.utcnow().isoformat() + "Z"
            stale_time = datetime.utcnow() + timedelta(minutes=5)
            stale = stale_time.isoformat() + "Z"

            cached = self.vessel_static_cache.get(mmsi, {})
            name = cached.get("name") or meta.get("ShipName") or str(mmsi)
            ship_type = cached.get("type", 0)

            classification = classify_vessel(ship_type, mmsi, name)
            nav_status = 15  # Undefined for Class B

            dim_a = cached.get("dimension_a", 0)
            dim_b = cached.get("dimension_b", 0)
            dim_c = cached.get("dimension_c", 0)
            dim_d = cached.get("dimension_d", 0)

            tak_event = {
                "uid": str(mmsi),
                "type": "a-f-S-C-M",
                "how": "m-g",
                "time": now,
                "start": now,
                "stale": stale,
                "point": {
                    "lat": msg["Latitude"],
                    "lon": msg["Longitude"],
                    "hae": 0,
                    "ce": 10.0,
                    "le": 10.0
                },
                "detail": {
                    "track": {
                        "course": msg.get("Cog", 0),
                        "speed": msg.get("Sog", 0) * 0.514444,
                        "heading": msg.get("TrueHeading", AIS_HEADING_NOT_AVAILABLE)
                    },
                    "contact": {
                        "callsign": name
                    },
                    "vesselClassification": {
                        "category": classification["category"],
                        "shipType": ship_type,
                        "navStatus": nav_status,
                        "hazardous": classification["hazardous"],
                        "stationType": classification["stationType"],
                        "flagMid": classification["flagMid"],
                        "imo": cached.get("imo", 0),
                        "callsign": cached.get("callsign", ""),
                        "destination": cached.get("destination", ""),
                        "draught": cached.get("draught", 0),
                        "length": dim_a + dim_b,
                        "beam": dim_c + dim_d
                    }
                }
            }
            return tak_event
        except Exception as e:
            logger.error(f"Failed to transform Class B message: {e}")
            return None

    def transform_to_tak(self, ais_message: dict) -> dict:
        """Transform AIS message to TAK-compatible format."""
        try:
            msg = ais_message["Message"]["PositionReport"]
            meta = ais_message["MetaData"]
            mmsi = meta["MMSI"]

            now = datetime.utcnow().isoformat() + "Z"
            stale_time = datetime.utcnow() + timedelta(minutes=5)
            stale = stale_time.isoformat() + "Z"

            cached = self.vessel_static_cache.get(mmsi, {})
            name = cached.get("name") or meta.get("ShipName") or str(mmsi)
            ship_type = cached.get("type", 0)

            classification = classify_vessel(ship_type, mmsi, name)
            nav_status = msg.get("NavigationalStatus", 15)

            dim_a = cached.get("dimension_a", 0)
            dim_b = cached.get("dimension_b", 0)
            dim_c = cached.get("dimension_c", 0)
            dim_d = cached.get("dimension_d", 0)

            tak_event = {
                "uid": str(mmsi),
                "type": "a-f-S-C-M",  # Sea - Contact - Maritime
                "how": "m-g",  # Machine - GPS
                "time": now,
                "start": now,
                "stale": stale,
                "point": {
                    "lat": msg["Latitude"],
                    "lon": msg["Longitude"],
                    "hae": 0,
                    "ce": 10.0,
                    "le": 10.0
                },
                "detail": {
                    "track": {
                        "course": msg.get("Cog", 0),
                        "speed": msg.get("Sog", 0) * 0.514444,  # knots to m/s
                        "heading": msg.get("TrueHeading", AIS_HEADING_NOT_AVAILABLE)
                    },
                    "contact": {
                        "callsign": name
                    },
                    "vesselClassification": {
                        "category": classification["category"],
                        "shipType": ship_type,
                        "navStatus": nav_status,
                        "hazardous": classification["hazardous"],
                        "stationType": classification["stationType"],
                        "flagMid": classification["flagMid"],
                        "imo": cached.get("imo", 0),
                        "callsign": cached.get("callsign", ""),
                        "destination": cached.get("destination", ""),
                        "draught": cached.get("draught", 0),
                        "length": dim_a + dim_b,
                        "beam": dim_c + dim_d
                    }
                }
            }

            return tak_event
        except Exception as e:
            logger.error(f"Failed to transform AIS message: {e}")
            return None

    def on_send_error(self, future):
        """Callback for Kafka send errors."""
        try:
            future.result()
        except Exception as e:
            logger.error(f"Failed to send to Kafka: {e}")

    async def stream_loop(self):
        """Main streaming loop - receives AIS messages and publishes to Kafka."""
        while self.running:
            try:
                # Connect or reconnect if needed
                if self.ws is None or (hasattr(self.ws, 'closed') and self.ws.closed) or self.bbox_update_needed:
                    now = datetime.utcnow()
                    
                    # 1. Enforce a minimum interval between ANY reconnection attempt
                    if self.last_reconnect_time:
                        elapsed_since_last = (now - self.last_reconnect_time).total_seconds()
                        if elapsed_since_last < MIN_RECONNECT_INTERVAL_SECONDS:
                            wait_time = MIN_RECONNECT_INTERVAL_SECONDS - elapsed_since_last
                            logger.info(f"⏳ Rate limit protection: Waiting {wait_time:.1f}s before next AISStream reconnect")
                            await asyncio.sleep(wait_time)
                            continue

                    # 2. Calculate exponential backoff delay with jitter
                    if self.reconnect_attempts > 0:
                        delay = min(
                            BACKOFF_MAX_DELAY_SECONDS,
                            BACKOFF_INITIAL_DELAY_SECONDS * (BACKOFF_FACTOR ** (self.reconnect_attempts - 1))
                        )
                        # Add +/- 10% jitter to prevent thundering herd
                        jitter = delay * 0.1
                        actual_delay = delay + random.uniform(-jitter, jitter)
                        
                        logger.warning(f"🔄 AISStream retry backoff: attempt {self.reconnect_attempts}, waiting {actual_delay:.1f}s")
                        await asyncio.sleep(actual_delay)

                    if self.ws:
                        try:
                            await self.ws.close()
                        except:
                            pass

                    self.last_reconnect_time = datetime.utcnow()
                    if not await self.connect_aisstream():
                        self.reconnect_attempts += 1
                        continue

                    # Connection successful
                    self.connection_start_time = datetime.utcnow()
                    self.bbox_update_needed = False
                    # Note: We don't reset self.reconnect_attempts here; 
                    # we do it after the connection proves it's stable.

                # Receive messages
                try:
                    message = await asyncio.wait_for(self.ws.recv(), timeout=30.0)
                    
                    # Connection is behaving - check if we've reached the stability threshold
                    if self.reconnect_attempts > 0 and self.connection_start_time:
                        connected_duration = (datetime.utcnow() - self.connection_start_time).total_seconds()
                        if connected_duration >= CONNECTION_STABILITY_THRESHOLD_SECONDS:
                            logger.info(f"✅ AISStream connection stable for {connected_duration:.0f}s - resetting backoff counter")
                            self.reconnect_attempts = 0
                            self.connection_start_time = None
                    
                    data = json.loads(message)

                    msg_type = data.get("MessageType")

                    if msg_type == "PositionReport":
                        tak_event = self.transform_to_tak(data)

                        if tak_event:
                            # Evaluate distance and drop if outside current dynamic mission radius
                            dist = calculate_distance_nm(
                                self.center_lat, 
                                self.center_lon, 
                                tak_event["point"]["lat"], 
                                tak_event["point"]["lon"]
                            )
                            
                            if dist <= self.radius_nm:
                                # Send to Kafka (non-blocking)
                                asyncio.create_task(
                                    self.kafka_producer.send(
                                        "ais_raw",
                                        value=tak_event,
                                        key=tak_event["uid"].encode("utf-8")
                                    )
                                )

                                # Log sparingly (every 100th message)
                                if hash(tak_event["uid"]) % 100 == 0:
                                    logger.debug(f"🚢 Published vessel {tak_event['detail']['contact']['callsign']}")
                    elif msg_type == "ShipStaticData":
                        meta = data.get("MetaData", {})
                        mmsi = meta.get("MMSI")
                        msg_data = data.get("Message", {}).get("ShipStaticData", {})
                        if mmsi and msg_data:
                            self.handle_static_data(mmsi, msg_data)
                    elif msg_type == "StaticDataReport":
                        meta = data.get("MetaData", {})
                        mmsi = meta.get("MMSI")
                        msg_data = data.get("Message", {}).get("StaticDataReport", {})
                        if mmsi and msg_data:
                            if "ReportA" in msg_data:
                                self.handle_static_data(mmsi, msg_data["ReportA"])
                            if "ReportB" in msg_data:
                                self.handle_static_data(mmsi, msg_data["ReportB"])
                    elif msg_type == "StandardClassBPositionReport":
                        tak_event = self.handle_class_b_position(data)

                        if tak_event:
                            dist = calculate_distance_nm(
                                self.center_lat, 
                                self.center_lon, 
                                tak_event["point"]["lat"], 
                                tak_event["point"]["lon"]
                            )
                            
                            if dist <= self.radius_nm:
                                # Send to Kafka (non-blocking)
                                asyncio.create_task(
                                    self.kafka_producer.send(
                                        "ais_raw",
                                        value=tak_event,
                                        key=tak_event["uid"].encode("utf-8")
                                    )
                                )

                                if hash(tak_event["uid"]) % 100 == 0:
                                    logger.debug(f"🚢 Published Class B vessel {tak_event['detail']['contact']['callsign']}")

                except asyncio.TimeoutError:
                    # No message in 30s - send ping to keep connection alive
                    if self.ws:
                        try:
                            await self.ws.ping()
                        except:
                            pass

            except websockets.exceptions.ConnectionClosed:
                logger.warning("🌊 AISStream connection closed, reconnecting...")
                self.ws = None
                await asyncio.sleep(1.0)

            except Exception as e:
                logger.error(f"Error in stream loop: {e}")
                await asyncio.sleep(1)


    async def cleanup_cache(self):
        """Periodically clean up stale vessel static data."""
        while self.running:
            await asyncio.sleep(600)  # Every 10 mins
            now = datetime.utcnow()
            stale_mmsis = [
                mmsi for mmsi, data in self.vessel_static_cache.items()
                if (now - data["last_seen"]).total_seconds() > 1800
            ]
            for mmsi in stale_mmsis:
                del self.vessel_static_cache[mmsi]
            if stale_mmsis:
                logger.debug(f"🧹 Evicted {len(stale_mmsis)} stale vessels from static cache")
