
import asyncio
import logging
import json
import os
import signal
import time

from typing import Dict, List, Optional
from aiokafka import AIOKafkaProducer
from multi_source_poller import MultiSourcePoller

# Config - Read from ENV (set in docker-compose.yml)
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BROKERS", "sovereign-redpanda:9092")
TOPIC_OUT = "adsb_raw"

# Location config - centralized in docker-compose.yml / .env
CENTER_LAT = float(os.getenv("CENTER_LAT", "45.5152"))
CENTER_LON = float(os.getenv("CENTER_LON", "-122.6784"))
COVERAGE_RADIUS_NM = int(os.getenv("COVERAGE_RADIUS_NM", "150"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("poller_service")

class PollerService:
    def __init__(self):
        self.running = True
        self.poller = MultiSourcePoller()
        self.producer = None

    async def setup(self):
        await self.poller.start()
        self.producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP)
        await self.producer.start()
        logger.info("Poller service ready")

    async def shutdown(self):
        logger.info("Shutting down...")
        self.running = False
        await self.poller.close()
        await self.producer.stop()

    async def loop(self):
        """Main Event Loop - Simple Round-Robin of fixed polling points."""
        logger.info(f"Starting Polling Loop - Center: ({CENTER_LAT}, {CENTER_LON}), Radius: {COVERAGE_RADIUS_NM}nm")
        
        # 3 overlapping circles to cover the monitoring region
        # Main circle at center, plus 2 offset circles for edge coverage
        polling_points = [
            (CENTER_LAT, CENTER_LON, COVERAGE_RADIUS_NM),           # Center
            (CENTER_LAT + 0.5, CENTER_LON - 0.5, 100),              # NW offset  
            (CENTER_LAT - 0.5, CENTER_LON + 0.5, 100),              # SE offset
        ]
        current_point = 0
        
        while self.running:
            lat, lon, radius = polling_points[current_point]
            current_point = (current_point + 1) % len(polling_points)
            
            await self.process_point(lat, lon, radius)
            
            # Sleep based on source rate limits
            # With 3 sources at 2s each, we cycle every 6s which means each point ~18s
            # That's way better than 5 minutes!
            await asyncio.sleep(2.0) 

    async def process_point(self, lat: float, lon: float, radius: int):
        """Poll a single point and publish aircraft to Kafka."""
        aircraft = await self.poller.poll_point(lat, lon, radius)
        
        if not aircraft:
            return
            
        logger.debug(f"Received {len(aircraft)} aircraft from ({lat:.2f}, {lon:.2f})")

        for ac in aircraft:
            tak_msg = self.normalize_to_tak(ac)
            if tak_msg:
                key = tak_msg["uid"].encode("utf-8")
                val = json.dumps(tak_msg).encode("utf-8")
                await self.producer.send(TOPIC_OUT, value=val, key=key)

    def normalize_to_tak(self, ac: Dict) -> Optional[Dict]:
        """Convert ADSBx format to SovereignWatch TAK-ish JSON format."""
        # Simple mapping matching aviation_ingest.yaml logic
        if not ac.get("lat") or not ac.get("lon"):
            return None
            
        return {
            "uid": ac.get("hex", "").lower(),
            "type": "a-f-A-C-F", # Simplified default
            "how": "m-g",
            "time": time.time() * 1000, # MS? API uses now() which is TS.
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
        loop.run_until_complete(service.loop())
    except asyncio.CancelledError:
        pass
    finally:
        loop.run_until_complete(service.shutdown())
