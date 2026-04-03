import asyncio
import json
import logging
import os
import random
import time
from datetime import datetime, timedelta
from typing import Optional, Dict

import redis.asyncio as redis
import websockets
import websockets.exceptions
from aiokafka import AIOKafkaProducer

from classification import classify_vessel
from utils import calculate_bboxes, calculate_distance_nm, AIS_HEADING_NOT_AVAILABLE

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


# AISStream Reconnection Stability Constants
MIN_LAT_LON_CHANGE_DEG = 0.05  # ~3nm at mid-latitudes
BBOX_DEBOUNCE_SECONDS = 5.0

# Rate Limit Mitigations
MIN_RECONNECT_INTERVAL_SECONDS = 30.0  # Minimum time between ANY reconnection
BACKOFF_INITIAL_DELAY_SECONDS = 5.0
BACKOFF_MAX_DELAY_SECONDS = 300.0
BACKOFF_FACTOR = 2.0
CONNECTION_STABILITY_THRESHOLD_SECONDS = 60.0 # Time connected to reset backoff
NO_DATA_TIMEOUT_SECONDS = 300.0
NO_DATA_ERROR_CODE = "no_data_timeout"


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
        
        # New: Event to signal that a reconnection is needed (e.g. area change)
        self.reconnect_event = asyncio.Event()

        # Throttle Redis heartbeat writes (at most once per 30s)
        self._last_heartbeat: float = 0.0

        # Track raw AIS frame activity to detect silent upstream stalls.
        self.last_data_received_at: Optional[float] = None

    async def _write_heartbeat(self, now_ts: Optional[float] = None):
        """Update maritime heartbeat in Redis, throttled to avoid write spam."""
        if now_ts is None:
            now_ts = time.time()

        if now_ts - self._last_heartbeat < 30:
            return

        self._last_heartbeat = now_ts
        try:
            await self.redis_client.set("maritime:last_message_at", str(now_ts), ex=300)
        except Exception:
            pass

    async def _record_no_data_timeout(self, idle_seconds: float):
        """Persist a structured no-data error so health APIs can distinguish silence vs crashes."""
        try:
            await self.redis_client.set(
                "poller:maritime:last_error",
                json.dumps(
                    {
                        "ts": time.time(),
                        "code": NO_DATA_ERROR_CODE,
                        "msg": (
                            "No AIS frames received for "
                            f"{int(idle_seconds)}s; reconnecting with cooldown"
                        ),
                    }
                ),
                ex=86400,
            )
        except Exception:
            pass

    async def _clear_no_data_error(self):
        """Clear the no-data error once AIS traffic resumes."""
        try:
            raw = await self.redis_client.get("poller:maritime:last_error")
            if not raw:
                return

            parsed = json.loads(raw)
            if parsed.get("code") == NO_DATA_ERROR_CODE:
                await self.redis_client.delete("poller:maritime:last_error")
        except Exception:
            pass

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
        logger.info("📡 Redis pub/sub subscribed to navigation-updates")

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
        logger.info("🔄 Bbox debounce elapsed — signalling AISStream reconnect")
        self.reconnect_event.set()

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

                            # Cancel any pending reconnect so rapid preset clicks
                            # collapse into a single reconnect (debounce).
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
        bboxes = calculate_bboxes(self.center_lat, self.center_lon, 350)
        subscription_message = {
            "APIKey": AISSTREAM_API_KEY,
            "BoundingBoxes": bboxes,
            "FilterMessageTypes": [
                "PositionReport",
                "ShipStaticData",
                "StandardClassBPositionReport",
                "StaticDataReport"
            ]
        }

        logger.info(f"🌊 Connecting to AISStream.io with bboxes: {bboxes} (Radius: 350nm)")
        logger.debug(f"DEBUG: Subscription Message: {json.dumps(subscription_message)}")

        try:
            self.ws = await websockets.connect(
                "wss://stream.aisstream.io/v0/stream",
                open_timeout=30,
                ping_interval=30,
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

        if "Type" in msg:
            cache["type"] = msg["Type"]
        elif "ShipType" in msg:
            cache["type"] = msg["ShipType"]

        if "ImoNumber" in msg:
            cache["imo"] = msg["ImoNumber"]
        if "CallSign" in msg:
            cache["callsign"] = msg["CallSign"]
        if "Name" in msg:
            cache["name"] = msg["Name"].strip()
        elif "ShipName" in msg:
            cache["name"] = msg["ShipName"].strip()

        if "Dimension" in msg:
            dim = msg["Dimension"]
            cache["dimension_a"] = dim.get("A", 0)
            cache["dimension_b"] = dim.get("B", 0)
            cache["dimension_c"] = dim.get("C", 0)
            cache["dimension_d"] = dim.get("D", 0)

        if "MaximumStaticDraught" in msg:
            cache["draught"] = msg["MaximumStaticDraught"]
        if "Destination" in msg:
            cache["destination"] = msg["Destination"].strip()
        if "Eta" in msg:
            cache["eta"] = msg["Eta"]
        if "FixType" in msg:
            cache["fix_type"] = msg["FixType"]

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

            true_heading = msg.get("TrueHeading")
            if true_heading is None:
                true_heading = AIS_HEADING_NOT_AVAILABLE

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
                        "heading": true_heading
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
                    },
                    "classification": {
                        "category": classification["category"]
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

            true_heading = msg.get("TrueHeading")
            if true_heading is None:
                true_heading = AIS_HEADING_NOT_AVAILABLE

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
                        "heading": true_heading
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
                    },
                    "classification": {
                        "category": classification["category"]
                    }
                }
            }

            return tak_event
        except Exception as e:
            logger.error(f"Failed to transform AIS message: {e}")
            return None

    async def publish_tak_event(self, tak_event: dict):
        """Unified helper to distance-filter and publish TAK events to Kafka."""
        # Evaluate distance and drop if outside current dynamic mission radius
        dist = calculate_distance_nm(
            self.center_lat, 
            self.center_lon, 
            tak_event["point"]["lat"], 
            tak_event["point"]["lon"]
        )
        
        if dist > self.radius_nm:
            return

        # Send to Kafka
        try:
            # BUG-FIX: Await the send coroutine; key pins each vessel to a
            # consistent Kafka partition for ordered processing per MMSI.
            await self.kafka_producer.send_and_wait(
                "ais_raw",
                value=tak_event,
                key=tak_event["uid"].encode("utf-8"),
            )
            
            # Log sparingly (every 100th message)
            if hash(tak_event["uid"]) % 100 == 0:
                logger.debug(f"🚢 Published vessel {tak_event['detail']['contact']['callsign']}")
        except Exception as e:
            logger.error(f"❌ Failed to publish to Kafka: {e}")

    async def stream_loop(self):
        """Main streaming loop - receives AIS messages and publishes to Kafka."""
        while self.running:
            try:
                # 1. Rate-limit protection: enforce minimum interval between reconnects
                now = datetime.utcnow()
                if self.last_reconnect_time:
                    elapsed = (now - self.last_reconnect_time).total_seconds()
                    if elapsed < MIN_RECONNECT_INTERVAL_SECONDS:
                        wait_time = MIN_RECONNECT_INTERVAL_SECONDS - elapsed
                        logger.info(f"⏳ Rate limit protection: waiting {wait_time:.1f}s before reconnect")
                        await asyncio.sleep(wait_time)
                        continue

                # 2. Exponential backoff with jitter on repeated failures
                if self.reconnect_attempts > 0:
                    delay = min(
                        BACKOFF_MAX_DELAY_SECONDS,
                        BACKOFF_INITIAL_DELAY_SECONDS * (BACKOFF_FACTOR ** (self.reconnect_attempts - 1))
                    )
                    jitter = delay * 0.1
                    actual_delay = delay + random.uniform(-jitter, jitter)
                    logger.warning(f"🔄 AISStream retry backoff: attempt {self.reconnect_attempts}, waiting {actual_delay:.1f}s")
                    await asyncio.sleep(actual_delay)

                self.last_reconnect_time = datetime.utcnow()

                # 3. (Re)connect
                if not await self.connect_aisstream():
                    self.reconnect_attempts += 1
                    continue

                self.connection_start_time = datetime.utcnow()
                self.last_data_received_at = time.time()
                self.reconnect_event.clear()

                # Inner message loop
                message_task = None

                while self.running and not self.reconnect_event.is_set():
                    try:
                        # Re-use message_task if it's still pending from a previous timeout
                        if message_task is None or message_task.done():
                            message_task = asyncio.create_task(self.ws.recv())

                        reconnect_task = asyncio.create_task(self.reconnect_event.wait())
                        
                        # Wait for either a message, a timeout (for ping), or a reconnect signal
                        done, pending = await asyncio.wait(
                            [message_task, reconnect_task],
                            timeout=20.0,
                            return_when=asyncio.FIRST_COMPLETED
                        )

                        if self.reconnect_event.is_set():
                            logger.info("🔄 Reconnect signal received - closing current stream")
                            for task in pending:
                                task.cancel()
                            break

                        if message_task in done:
                            # Cancel reconnect_task since we're done with this iteration
                            reconnect_task.cancel()

                            # Connection is healthy — reset backoff once stable
                            if self.reconnect_attempts > 0 and self.connection_start_time:
                                connected_for = (datetime.utcnow() - self.connection_start_time).total_seconds()
                                if connected_for >= CONNECTION_STABILITY_THRESHOLD_SECONDS:
                                    logger.info(f"✅ AISStream stable for {connected_for:.0f}s — resetting backoff")
                                    self.reconnect_attempts = 0
                                    self.connection_start_time = None

                            message = message_task.result()
                            data = json.loads(message)
                            msg_type = data.get("MessageType")
                            now_ts = time.time()
                            self.last_data_received_at = now_ts
                            await self._clear_no_data_error()

                            if msg_type == "PositionReport":
                                tak_event = self.transform_to_tak(data)
                                if tak_event:
                                    await self.publish_tak_event(tak_event)
                                    await self._write_heartbeat(now_ts)
                            elif msg_type == "StandardClassBPositionReport":
                                tak_event = self.handle_class_b_position(data)
                                if tak_event:
                                    await self.publish_tak_event(tak_event)
                                    await self._write_heartbeat(now_ts)
                            elif msg_type == "ShipStaticData":
                                meta = data.get("MetaData", {})
                                mmsi = meta.get("MMSI")
                                msg_data = data.get("Message", {}).get("ShipStaticData", {})
                                if mmsi and msg_data:
                                    self.handle_static_data(mmsi, msg_data)
                                    await self._write_heartbeat(now_ts)
                            elif msg_type == "StaticDataReport":
                                meta = data.get("MetaData", {})
                                mmsi = meta.get("MMSI")
                                msg_data = data.get("Message", {}).get("StaticDataReport", {})
                                if mmsi and msg_data:
                                    if "ReportA" in msg_data:
                                        self.handle_static_data(mmsi, msg_data["ReportA"])
                                    if "ReportB" in msg_data:
                                        self.handle_static_data(mmsi, msg_data["ReportB"])
                                    await self._write_heartbeat(now_ts)
                            else:
                                # AISStream sends error/status frames without a MessageType
                                # (e.g. rate-limit notices). Log them so they're visible.
                                error = data.get("Error") or data.get("error")
                                if error:
                                    logger.warning(f"⚠️ AISStream error frame: {error}")
                                else:
                                    logger.debug(f"Unhandled AISStream frame (type={msg_type}): {data}")
                        else:
                            # Timeout elapsed — the websockets library's ping_interval
                            # already handles keepalives. Cancel reconnect_task.
                            # Do NOT cancel message_task so it can be reused on the next loop.
                            reconnect_task.cancel()

                            # Connected-but-silent stream: emit explicit no-data state
                            # and force a cooldown reconnect to recover automatically.
                            last_seen = self.last_data_received_at
                            if last_seen is not None:
                                idle_for = time.time() - last_seen
                                if idle_for >= NO_DATA_TIMEOUT_SECONDS:
                                    logger.warning(
                                        "⚠️ No AIS frames for %.0fs; reconnecting with backoff",
                                        idle_for,
                                    )
                                    await self._record_no_data_timeout(idle_for)
                                    self.reconnect_attempts += 1
                                    if message_task and not message_task.done():
                                        message_task.cancel()
                                        message_task = None
                                    break

                    except websockets.exceptions.ConnectionClosed:
                        logger.warning("🌊 AISStream connection closed by server")
                        break
                    except Exception as e:
                        logger.error(f"Error in message loop: {e}")
                        await asyncio.sleep(1)

            except Exception as e:
                logger.error(f"Error in stream loop: {e}")
                try:
                    await self.redis_client.set(
                        "poller:maritime:last_error",
                        json.dumps({"ts": time.time(), "msg": str(e)}),
                        ex=86400,
                    )
                except Exception:
                    pass
                await asyncio.sleep(1)
            finally:
                if self.ws:
                    await self.ws.close()
                    self.ws = None


    async def cleanup_cache(self):
        """Periodically clean up stale vessel static data."""
        while self.running:
            await asyncio.sleep(600)  # Every 10 mins
            now = datetime.utcnow()
            stale_mmsis = [
                mmsi for mmsi, data in self.vessel_static_cache.items()
                if (now - data["last_seen"]).total_seconds() > 7200  # 2 hours
            ]
            for mmsi in stale_mmsis:
                del self.vessel_static_cache[mmsi]
            if stale_mmsis:
                logger.debug(f"🧹 Evicted {len(stale_mmsis)} stale vessels from static cache")
