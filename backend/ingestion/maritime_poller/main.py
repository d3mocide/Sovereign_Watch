"""
Maritime AIS Poller with Dynamic Area Management
Uses AISStream.io WebSocket API with Redis pub/sub for real-time area updates
"""
import asyncio
import json
import logging
import os
from typing import Optional, Dict

import redis.asyncio as redis
import websockets
from aiokafka import AIOKafkaProducer
from datetime import datetime, timedelta

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


def classify_vessel(ship_type: int, mmsi: int, name: str) -> dict:
    category = "unknown"
    hazardous = False
    
    if ship_type == 30:
        category = "fishing"
    elif ship_type in (31, 32, 52):
        category = "tug"
    elif ship_type == 35:
        category = "military"
    elif ship_type in (36, 37):
        category = "pleasure"
    elif 40 <= ship_type <= 49:
        category = "hsc"
    elif ship_type == 50:
        category = "pilot"
    elif ship_type == 51:
        category = "sar"
    elif ship_type == 55:
        category = "law_enforcement"
    elif ship_type in (58, 59):
        category = "special"
    elif 60 <= ship_type <= 69:
        category = "passenger"
    elif 70 <= ship_type <= 79:
        category = "cargo"
    elif 80 <= ship_type <= 89:
        category = "tanker"
        
    if 1 <= (ship_type % 10) <= 4 and category in ("cargo", "tanker", "passenger", "hsc"):
        hazardous = True
        
    mmsi_str = str(mmsi)
    flag_mid = 0
    station_type = "ship"
    
    if len(mmsi_str) == 9:
        if mmsi_str.startswith("00"):
            station_type = "coastal"
            flag_mid = int(mmsi_str[2:5])
        elif mmsi_str.startswith("0"):
            station_type = "group"
            flag_mid = int(mmsi_str[1:4])
        elif mmsi_str.startswith("111"):
            station_type = "sar_aircraft"
            flag_mid = int(mmsi_str[3:6])
        elif mmsi_str.startswith("8"):
            station_type = "handheld"
            flag_mid = int(mmsi_str[1:4])
        elif mmsi_str.startswith("98"):
            station_type = "craft_associated"
            flag_mid = int(mmsi_str[2:5])
        elif mmsi_str.startswith("99"):
            station_type = "navaid"
            flag_mid = int(mmsi_str[2:5])
        else:
            station_type = "ship"
            flag_mid = int(mmsi_str[0:3])

    return {
        "category": category,
        "shipType": ship_type,
        "hazardous": hazardous,
        "stationType": station_type,
        "flagMid": flag_mid
    }


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
        
        self.reconnect_delay = 5  # seconds
        self.bbox_update_needed = False
        self.vessel_static_cache: Dict[int, dict] = {}

    def calculate_bbox(self):
        """
        Calculate bounding box from center point and radius.
        Returns [[min_lat, min_lon], [max_lat, max_lon]]
        """
        # Simple approximation: 1 degree latitude ≈ 60nm
        # 1 degree longitude ≈ 60nm * cos(lat)
        import math
        
        lat_offset = self.radius_nm / 60.0
        lon_offset = self.radius_nm / (60.0 * math.cos(math.radians(self.center_lat)))
        
        min_lat = self.center_lat - lat_offset
        max_lat = self.center_lat + lat_offset
        min_lon = self.center_lon - lon_offset
        max_lon = self.center_lon + lon_offset
        
        # AISStream format: [[min_lat, min_lon], [max_lat, max_lon]]
        return [[min_lat, min_lon], [max_lat, max_lon]]

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
            mission_json = await self.redis_client.get("active_mission_area")
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
            await self.pubsub.close()
        if self.redis_client:
            await self.redis_client.close()
        
        logger.info("🛑 Maritime poller shutdown complete")

    async def navigation_listener(self):
        """Background task listening for mission area updates from Redis."""
        try:
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    try:
                        mission = json.loads(message["data"])
                        old_center = (self.center_lat, self.center_lon, self.radius_nm)
                        
                        self.center_lat = mission["lat"]
                        self.center_lon = mission["lon"]
                        self.radius_nm = mission["radius_nm"]
                        
                        logger.info(f"📍 Mission area updated: {old_center} → ({self.center_lat}, {self.center_lon}) @ {self.radius_nm}nm")
                        
                        # Flag that we need to update the AISStream subscription
                        self.bbox_update_needed = True
                        
                    except Exception as e:
                        logger.error(f"Failed to parse mission update: {e}")
        except asyncio.CancelledError:
            logger.info("Navigation listener cancelled")

    async def connect_aisstream(self):
        """Connect to AISStream.io WebSocket and subscribe with current bbox."""
        bbox = self.calculate_bbox()
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
            self.ws = await websockets.connect("wss://stream.aisstream.io/v0/stream")
            await self.ws.send(json.dumps(subscription_message))
            logger.info("✅ AISStream.io connection established")
            return True
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
                        "heading": msg.get("TrueHeading", 511)
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
                        "heading": msg.get("TrueHeading", 511)
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

    async def stream_loop(self):
        """Main streaming loop - receives AIS messages and publishes to Kafka."""
        while self.running:
            try:
                # Connect or reconnect if needed
                if self.ws is None or (hasattr(self.ws, 'closed') and self.ws.closed) or self.bbox_update_needed:
                    if self.ws:
                        try:
                            await self.ws.close()
                        except:
                            pass
                    
                    if not await self.connect_aisstream():
                        logger.warning(f"Retrying connection in {self.reconnect_delay}s...")
                        await asyncio.sleep(self.reconnect_delay)
                        continue
                    
                    self.bbox_update_needed = False
                
                # Receive messages
                try:
                    message = await asyncio.wait_for(self.ws.recv(), timeout=30.0)
                    data = json.loads(message)
                    
                    msg_type = data.get("MessageType")
                    
                    if msg_type == "PositionReport":
                        tak_event = self.transform_to_tak(data)
                        
                        if tak_event:
                            # Send to Kafka
                            await self.kafka_producer.send(
                                "ais_raw",
                                value=tak_event,
                                key=tak_event["uid"].encode("utf-8")
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
                            await self.kafka_producer.send(
                                "ais_raw",
                                value=tak_event,
                                key=tak_event["uid"].encode("utf-8")
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
                await asyncio.sleep(self.reconnect_delay)
            
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


async def main():
    service = MaritimePollerService()
    
    try:
        await service.setup()
        
        # Run both the streaming loop and navigation listener concurrently
        await asyncio.gather(
            service.stream_loop(),
            service.navigation_listener(),
            service.cleanup_cache()
        )
    
    except KeyboardInterrupt:
        logger.info("🛑 Received shutdown signal")
    
    finally:
        await service.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
