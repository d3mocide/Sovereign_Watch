import asyncio
import csv
import io
import json
import logging
import os
import time
import zipfile

import aiohttp
from aiokafka import AIOKafkaProducer
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger("SovereignWatch.GDELTPulse")
logging.basicConfig(level=logging.INFO)

GDELT_LAST_UPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", 900))  # 15 min


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

    @retry(
        stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10)
    )
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
                    # GDELT Events Export column indices (0-indexed).
                    # Current feed uses 61 columns; SOURCEURL is the last column.
                    # 0:  GlobalEventID
                    # 1:  SQLDATE (YYYYMMDD)
                    # 6:  Actor1Name
                    # 7:  Actor1CountryCode
                    # 16: Actor2Name
                    # 17: Actor2CountryCode
                    # 26: EventCode (full CAMEO code)
                    # 28: EventRootCode (top-level CAMEO, 2 digits)
                    # 29: QuadClass (1=VerbalCoop,2=MatCoop,3=VerbalConflict,4=MatConflict)
                    # 30: GoldsteinScale
                    # 31: NumMentions
                    # 32: NumSources
                    # 33: NumArticles
                    # 34: AvgTone
                    # 40: Actor1Geo_Lat  (used as primary event lat)
                    # 41: Actor1Geo_Long (used as primary event lon)
                    # 60: SOURCEURL (or row[-1] for forward-compatibility)
                    try:
                        if len(row) < 42:
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
                        # SOURCEURL has shifted in newer GDELT feeds; use the last
                        # column instead of a hard-coded index to avoid schema drift.
                        url = row[-1] if row else None

                        # Enriched fields
                        actor2 = row[16] or None
                        actor1_country = row[7] or None
                        actor2_country = row[17] or None
                        event_code = row[26] or None
                        event_root_code = row[28] or None
                        quad_class_raw = row[29]
                        quad_class = (
                            int(quad_class_raw)
                            if quad_class_raw and quad_class_raw.isdigit()
                            else None
                        )
                        num_mentions_raw = row[31]
                        num_mentions = (
                            int(num_mentions_raw)
                            if num_mentions_raw and num_mentions_raw.isdigit()
                            else None
                        )
                        num_sources_raw = row[32]
                        num_sources = (
                            int(num_sources_raw)
                            if num_sources_raw and num_sources_raw.isdigit()
                            else None
                        )
                        num_articles_raw = row[33]
                        num_articles = (
                            int(num_articles_raw)
                            if num_articles_raw and num_articles_raw.isdigit()
                            else None
                        )
                        sqldate_str = row[1] or None

                        # Pack into a GDELT raw message for the Historian
                        msg = {
                            "event_id": event_id,
                            "time": int(time.time() * 1000),
                            "lat": lat,
                            "lon": lon,
                            "goldstein": goldstein,
                            "tone": tone,
                            "headline": actor1,
                            "actor1": actor1,
                            "actor2": actor2,
                            "actor1_country": actor1_country,
                            "actor2_country": actor2_country,
                            "event_code": event_code,
                            "event_root_code": event_root_code,
                            "quad_class": quad_class,
                            "num_mentions": num_mentions,
                            "num_sources": num_sources,
                            "num_articles": num_articles,
                            "event_date": sqldate_str,
                            "url": url,
                            "dataSource": "GDELT",
                        }

                        await self.producer.send_and_wait(
                            "gdelt_raw", json.dumps(msg).encode("utf-8")
                        )
                        events_sent += 1

                    except (ValueError, IndexError):
                        continue

                logger.info(f"Published {events_sent} GDELT events to gdelt_raw topic.")
