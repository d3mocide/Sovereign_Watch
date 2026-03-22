import asyncio
import logging
import os
import aiohttp
import zipfile
import io
import csv
import json
import time
from aiokafka import AIOKafkaProducer
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger("SovereignWatch.GDELTPulse")
logging.basicConfig(level=logging.INFO)

GDELT_LAST_UPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", 900)) # 15 min

class GDELTPulseService:
    def __init__(self):
        self.producer = None
        self.session = None
        self.last_fetched_url = None
        self._running = False

    async def setup(self):
        """Build a Tak-compatible event producer."""
        logger.info("Setting up GDELT Pulse Service...")
        self.producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BROKERS)
        await self.producer.start()
        self.session = aiohttp.ClientSession(
            headers={"User-Agent": "Mozilla/5.0 (SovereignWatch/1.0; GDELTPulse)"}
        )
        self._running = True

    async def shutdown(self):
        """Clean up resources."""
        logger.info("Shutting down GDELT Pulse Service...")
        self._running = False
        if self.producer:
            await self.producer.stop()
        if self.session:
            await self.session.close()

    async def poll_loop(self):
        """Main periodic polling loop."""
        while self._running:
            try:
                await self.process_update()
            except Exception as e:
                logger.error(f"Poll loop error: {e}")
            
            logger.info(f"Sleeping for {POLL_INTERVAL}s...")
            await asyncio.sleep(POLL_INTERVAL)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def process_update(self):
        """Check for the latest update and parse the export CSV."""
        async with self.session.get(GDELT_LAST_UPDATE_URL) as resp:
            if resp.status != 200:
                logger.error(f"Failed to fetch lastupdate.txt: {resp.status}")
                return
            
            content = await resp.text()
            # The file has 3 lines: export, mentions, gkg. We take the first.
            first_line = content.splitlines()[0]
            parts = first_line.split()
            if len(parts) < 3:
                return
            
            export_url = parts[2]
            if export_url == self.last_fetched_url:
                logger.info("GDELT update unchanged. Skipping.")
                return

            logger.info(f"New GDELT update found: {export_url}")
            await self.fetch_and_parse(export_url)
            self.last_fetched_url = export_url

    async def fetch_and_parse(self, url: str):
        """Download zip, extract CSV, and push events to Kafka."""
        async with self.session.get(url) as resp:
            if resp.status != 200:
                logger.error(f"Failed to download GDELT zip: {resp.status}")
                return
            
            data = await resp.read()
            
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            # zip contains a single CSV file with the same name as the zip minus .zip
            csv_filename = zf.namelist()[0]
            with zf.open(csv_filename) as f:
                # TSV format, no header. Use TextIOWrapper and csv.reader with TAB delimiter
                text_stream = io.TextIOWrapper(f, encoding="utf-8")
                reader = csv.reader(text_stream, delimiter="\t")
                
                events_sent = 0
                for row in reader:
                    # GDELT column indices (0-indexed):
                    # 0: GlobalEventID
                    # 30: GoldsteinScale
                    # 34: AvgTone
                    # 40: ActionGeo_Lat
                    # 41: ActionGeo_Long
                    # 6: Actor1Name (optional descriptor)
                    # 57: SOURCEURL
                    try:
                        if len(row) < 58:
                            continue
                        
                        lat_str = row[40]
                        lon_str = row[41]
                        if not lat_str or not lon_str:
                            continue
                        
                        event_id = row[0]
                        lat = float(lat_str)
                        lon = float(lon_str)
                        goldstein = float(row[30]) if row[30] else 0.0
                        tone = float(row[34]) if row[34] else 0.0
                        actor1 = row[6] or "Unknown"
                        url = row[57]
                        
                        # Pack into a simple GDELT raw message for the Historian
                        msg = {
                            "event_id": event_id,
                            "time": int(time.time() * 1000),
                            "lat": lat,
                            "lon": lon,
                            "goldstein": goldstein,
                            "tone": tone,
                            "headline": actor1,
                            "url": url,
                            "dataSource": "GDELT"
                        }
                        
                        await self.producer.send_and_wait("gdelt_raw", json.dumps(msg).encode("utf-8"))
                        events_sent += 1
                        
                    except (ValueError, IndexError):
                        continue
                
                logger.info(f"Published {events_sent} GDELT events to gdelt_raw topic.")
