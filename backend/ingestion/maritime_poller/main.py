"""
Maritime AIS Poller with Dynamic Area Management
Uses AISStream.io WebSocket API with Redis pub/sub for real-time area updates
"""
import asyncio
import json
import logging
import os
from typing import Optional

import redis.asyncio as redis
import websockets
from aiokafka import AIOKafkaProducer
from datetime import datetime

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
            "FilterMessageTypes": ["PositionReport"]
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

    def transform_to_tak(self, ais_message: dict) -> dict:
        """Transform AIS message to TAK-compatible format."""
        try:
            msg = ais_message["Message"]["PositionReport"]
            meta = ais_message["MetaData"]
            
            now = datetime.utcnow().isoformat() + "Z"
            stale_time = datetime.utcnow()
            stale_time = stale_time.replace(minute=stale_time.minute + 5)
            stale = stale_time.isoformat() + "Z"
            
            tak_event = {
                "uid": str(meta["MMSI"]),
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
                        "speed": msg.get("Sog", 0) * 0.514444  # knots to m/s
                    },
                    "contact": {
                        "callsign": meta.get("ShipName", str(meta["MMSI"]))
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
                if self.ws is None or self.ws.closed or self.bbox_update_needed:
                    if self.ws and not self.ws.closed:
                        await self.ws.close()
                    
                    if not await self.connect_aisstream():
                        logger.warning(f"Retrying connection in {self.reconnect_delay}s...")
                        await asyncio.sleep(self.reconnect_delay)
                        continue
                    
                    self.bbox_update_needed = False
                
                # Receive messages
                try:
                    message = await asyncio.wait_for(self.ws.recv(), timeout=30.0)
                    data = json.loads(message)
                    
                    # Filter for PositionReport
                    if data.get("MessageType") == "PositionReport":
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
                
                except asyncio.TimeoutError:
                    # No message in 30s - send ping to keep connection alive
                    if self.ws and not self.ws.closed:
                        await self.ws.ping()
                
            except websockets.exceptions.ConnectionClosed:
                logger.warning("🌊 AISStream connection closed, reconnecting...")
                self.ws = None
                await asyncio.sleep(self.reconnect_delay)
            
            except Exception as e:
                logger.error(f"Error in stream loop: {e}")
                await asyncio.sleep(1)


async def main():
    service = MaritimePollerService()
    
    try:
        await service.setup()
        
        # Run both the streaming loop and navigation listener concurrently
        await asyncio.gather(
            service.stream_loop(),
            service.navigation_listener()
        )
    
    except KeyboardInterrupt:
        logger.info("🛑 Received shutdown signal")
    
    finally:
        await service.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
