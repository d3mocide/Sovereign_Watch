import asyncio
import csv
import io
import json
import logging
import os
import time
import zipfile
from datetime import datetime

import aiohttp
import redis.asyncio as aioredis
from aiokafka import AIOKafkaProducer
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger("SovereignWatch.GDELTPulse")
logging.basicConfig(level=logging.INFO)

GDELT_LAST_UPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"
RELIEFWEB_API_URL = os.getenv("RELIEFWEB_API_URL", "https://api.reliefweb.int/v2/disasters")
RELIEFWEB_APPNAME = os.getenv("RELIEFWEB_APPNAME", "").strip()
RELIEFWEB_APPNAME_DOCS_URL = "https://apidoc.reliefweb.int/parameters#appname"

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")
GDELT_POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", 900))  # 15 min
RELIEFWEB_POLL_INTERVAL = int(os.getenv("RELIEFWEB_POLL_INTERVAL", 1800))  # 30 min
# When true, only publish CAMEO QuadClass 3 (VerbalConflict) and 4 (MaterialConflict).
# Set to "false" to restore all-events behaviour.
GDELT_CONFLICT_ONLY = os.getenv("GDELT_CONFLICT_ONLY", "true").lower() == "true"
REDIS_URL = os.getenv("REDIS_URL", "redis://sovereign-redis:6379")

# CAMEO QuadClass values that represent conflict events
CONFLICT_QUAD_CLASSES = frozenset({3, 4})  # 3=VerbalConflict, 4=MaterialConflict

# ReliefWeb disaster type name → approximate Goldstein scale equivalent.
# Conflict/violence events score near -10; natural disasters cluster around -3.
_RELIEFWEB_TYPE_GOLDSTEIN: dict[str, float] = {
    "Conflict and Violence": -8.0,
    "Complex Emergency": -8.0,
    "Famine": -6.0,
    "Epidemic": -5.0,
    "Drought": -4.0,
    "Flood": -3.0,
    "Flash Flood": -3.0,
    "Earthquake": -3.0,
    "Cyclone": -3.0,
    "Tropical Cyclone": -3.0,
    "Tsunami": -3.0,
    "Volcano": -3.0,
    "Landslide": -3.0,
    "Fire": -3.0,
    "Cold Wave": -2.0,
    "Heat Wave": -2.0,
}
_DEFAULT_RELIEFWEB_GOLDSTEIN = -3.0


class GDELTPulseService:
    def __init__(self):
        self.producer = None
        self.session = None
        self.redis = None
        self.last_fetched_url = None
        self._reliefweb_disabled_reason = None
        self._running = False

    async def setup(self):
        """Build a TAK-compatible event producer."""
        logger.info("Setting up GDELT Pulse Service...")
        self.producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BROKERS)
        await self.producer.start()
        self.session = aiohttp.ClientSession(
            headers={"User-Agent": "Mozilla/5.0 (SovereignWatch/1.0; GDELTPulse)"}
        )
        self.redis = aioredis.from_url(REDIS_URL, decode_responses=True)
        self._running = True

    async def shutdown(self):
        """Clean up resources."""
        logger.info("Shutting down GDELT Pulse Service...")
        self._running = False
        if self.producer:
            await self.producer.stop()
        if self.session:
            await self.session.close()
        if self.redis:
            await self.redis.aclose()

    async def poll_loop(self):
        """Run GDELT and ReliefWeb polling loops concurrently."""
        await asyncio.gather(
            self._gdelt_loop(),
            self._reliefweb_loop(),
        )

    # ------------------------------------------------------------------
    # GDELT loop
    # ------------------------------------------------------------------

    async def _gdelt_loop(self):
        """Periodic GDELT polling loop."""
        while self._running:
            try:
                await self.process_update()
            except Exception as e:
                logger.error(f"GDELT poll loop error: {e}")
                if self.redis:
                    try:
                        await self.redis.set(
                            "poller:gdelt:last_error",
                            json.dumps({"ts": time.time(), "msg": str(e)}),
                            ex=86400,
                        )
                    except Exception as re:
                        logger.debug("Redis error-state write failed: %s", re)

            logger.info(f"GDELT sleeping for {GDELT_POLL_INTERVAL}s...")
            await asyncio.sleep(GDELT_POLL_INTERVAL)

    @retry(
        stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def process_update(self):
        """Check for the latest GDELT update and parse the export CSV."""
        async with self.session.get(GDELT_LAST_UPDATE_URL) as resp:
            if resp.status != 200:
                logger.error(f"Failed to fetch lastupdate.txt: {resp.status}")
                return

            content = await resp.text()
            # File has 3 lines: export, mentions, gkg. Take the first.
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
            if self.redis:
                try:
                    await self.redis.set(
                        "gdelt_pulse:last_fetch", str(time.time()), ex=GDELT_POLL_INTERVAL * 4
                    )
                except Exception as e:
                    logger.debug("Redis heartbeat write failed: %s", e)

    async def fetch_and_parse(self, url: str):
        """Download zip, extract CSV, and push conflict events to Kafka.

        When GDELT_CONFLICT_ONLY is true (default), only events with
        QuadClass 3 (VerbalConflict) or 4 (MaterialConflict) are published.
        All cooperative/neutral events are dropped to reduce noise.
        """
        async with self.session.get(url) as resp:
            if resp.status != 200:
                logger.error(f"Failed to download GDELT zip: {resp.status}")
                return

            data = await resp.read()

        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            # Zip contains a single CSV file — same name as the zip minus .zip.
            csv_filename = zf.namelist()[0]
            with zf.open(csv_filename) as f:
                # TSV format, no header.
                text_stream = io.TextIOWrapper(f, encoding="utf-8")
                reader = csv.reader(text_stream, delimiter="\t")

                events_sent = 0
                events_filtered = 0
                for row in reader:
                    # GDELT Events Export column indices (0-indexed).
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
                    # 40: Actor1Geo_Lat
                    # 41: Actor1Geo_Long
                    # -1: SOURCEURL (last column for forward-compatibility)
                    try:
                        if len(row) < 42:
                            continue

                        lat_str = row[40]
                        lon_str = row[41]
                        if not lat_str or not lon_str:
                            continue

                        lat = float(lat_str)
                        lon = float(lon_str)

                        quad_class_raw = row[29]
                        quad_class = (
                            int(quad_class_raw)
                            if quad_class_raw and quad_class_raw.isdigit()
                            else None
                        )

                        # Conflict-only filter: drop cooperative/neutral events.
                        if GDELT_CONFLICT_ONLY and quad_class not in CONFLICT_QUAD_CLASSES:
                            events_filtered += 1
                            continue

                        event_id = row[0]
                        goldstein = float(row[30]) if row[30] else 0.0
                        tone = float(row[34]) if row[34] else 0.0
                        actor1 = row[6] or "Unknown"
                        # SOURCEURL has shifted in newer GDELT feeds; use the last
                        # column instead of a hard-coded index to avoid schema drift.
                        url_src = row[-1] if row else None

                        actor2 = row[16] or None
                        actor1_country = row[7] or None
                        actor2_country = row[17] or None
                        event_code = row[26] or None
                        event_root_code = row[28] or None
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
                            "url": url_src,
                            "dataSource": "GDELT",
                        }

                        await self.producer.send_and_wait(
                            "gdelt_raw", json.dumps(msg).encode("utf-8")
                        )
                        events_sent += 1

                    except (ValueError, IndexError) as e:
                        logger.debug("Skipping malformed GDELT row: %s", e)
                        continue

                filter_note = (
                    f" ({events_filtered} conflict-only filtered)"
                    if GDELT_CONFLICT_ONLY and events_filtered
                    else ""
                )
                logger.info(
                    f"Published {events_sent} GDELT events{filter_note} to gdelt_raw topic."
                )

    # ------------------------------------------------------------------
    # ReliefWeb loop
    # ------------------------------------------------------------------

    async def _reliefweb_loop(self):
        """Periodic ReliefWeb polling loop."""
        while self._running:
            try:
                await self.fetch_reliefweb()
            except Exception as e:
                logger.error(f"ReliefWeb poll loop error: {e}")
                if self.redis:
                    try:
                        await self.redis.set(
                            "poller:reliefweb:last_error",
                            json.dumps({"ts": time.time(), "msg": str(e)}),
                            ex=86400,
                        )
                    except Exception as re:
                        logger.debug("Redis error-state write failed: %s", re)

            logger.info(f"ReliefWeb sleeping for {RELIEFWEB_POLL_INTERVAL}s...")
            await asyncio.sleep(RELIEFWEB_POLL_INTERVAL)

    async def fetch_reliefweb(self):
        """Fetch current/alert disasters from ReliefWeb and publish to Kafka.

        Each disaster is emitted as one event per affected country so that
        geolocation is as precise as possible.  Events use the disaster's
        creation date as their timestamp, which gives the historian's
        ON CONFLICT (event_id, time) DO NOTHING clause stable deduplication
        across repeated polls of the same ongoing crisis.
        """
        if self._reliefweb_disabled_reason:
            return

        if not RELIEFWEB_APPNAME:
            self._disable_reliefweb(
                "ReliefWeb polling disabled: RELIEFWEB_APPNAME is not configured. "
                "ReliefWeb v2 requires an approved appname query parameter. "
                f"Request one at {RELIEFWEB_APPNAME_DOCS_URL}."
            )
            return

        payload = {
            "profile": "list",
            "fields": {
                "include": ["name", "date", "country", "type", "status", "url"]
            },
            "filter": {
                "operator": "OR",
                "conditions": [
                    {"field": "status", "value": "current"},
                    {"field": "status", "value": "alert"},
                ],
            },
            "limit": 200,
            "sort": ["date.created:desc"],
        }

        async with self.session.post(
            RELIEFWEB_API_URL,
            params={"appname": RELIEFWEB_APPNAME},
            json=payload,
            headers={"Content-Type": "application/json"},
        ) as resp:
            if resp.status != 200:
                error_body = await self._safe_reliefweb_error_body(resp)
                if resp.status == 403 and "approved appname" in error_body.lower():
                    self._disable_reliefweb(
                        "ReliefWeb polling disabled: RELIEFWEB_APPNAME was rejected by the "
                        f"API. Configure an approved appname and restart the service. See {RELIEFWEB_APPNAME_DOCS_URL}."
                    )
                    return

                logger.error(
                    "ReliefWeb API returned %s%s",
                    resp.status,
                    f": {error_body}" if error_body else "",
                )
                return
            body = await resp.json()

        items = body.get("data", [])
        events_sent = 0

        for item in items:
            try:
                fields = item.get("fields", {})
                disaster_id = str(item.get("id", ""))
                name = fields.get("name", "Unknown")
                status = fields.get("status", "")
                rw_url = fields.get("url") or f"https://reliefweb.int/disaster/{disaster_id}"

                # Map disaster type to a Goldstein-equivalent severity score.
                disaster_types = fields.get("type", [])
                type_name = disaster_types[0].get("name", "") if disaster_types else ""
                goldstein = _RELIEFWEB_TYPE_GOLDSTEIN.get(type_name, _DEFAULT_RELIEFWEB_GOLDSTEIN)

                # Parse creation date for stable deduplication timestamp.
                date_obj = fields.get("date", {})
                created_str = date_obj.get("created", "")
                event_date_str = None
                event_time_ms = int(time.time() * 1000)
                if created_str:
                    try:
                        dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                        event_date_str = dt.strftime("%Y%m%d")
                        event_time_ms = int(dt.timestamp() * 1000)
                    except ValueError as e:
                        logger.debug("Failed to parse ReliefWeb created date '%s': %s", created_str, e)

                # Emit one event per affected country for precise geolocation.
                countries = fields.get("country", [])
                if not countries:
                    continue

                for country in countries:
                    location = country.get("location")
                    if not location:
                        continue
                    lat = location.get("lat")
                    lon = location.get("lon")
                    if lat is None or lon is None:
                        continue

                    country_name = country.get("name", "")
                    iso3 = country.get("iso3", "")

                    msg = {
                        # Prefix avoids collisions with numeric GDELT event IDs.
                        "event_id": f"rw-{disaster_id}-{iso3}",
                        "time": event_time_ms,
                        "lat": float(lat),
                        "lon": float(lon),
                        "goldstein": goldstein,
                        "tone": None,
                        "headline": name,
                        "actor1": country_name,
                        "actor2": None,
                        "actor1_country": iso3 or None,
                        "actor2_country": None,
                        "event_code": type_name or None,
                        "event_root_code": status or None,
                        "quad_class": None,
                        "num_mentions": None,
                        "num_sources": None,
                        "num_articles": None,
                        "event_date": event_date_str,
                        "url": rw_url,
                        "dataSource": "ReliefWeb",
                    }

                    await self.producer.send_and_wait(
                        "gdelt_raw", json.dumps(msg).encode("utf-8")
                    )
                    events_sent += 1

            except Exception as e:
                logger.warning(f"ReliefWeb item parse error: {e}")
                continue

        logger.info(f"Published {events_sent} ReliefWeb disaster events to gdelt_raw topic.")
        if self.redis:
            try:
                await self.redis.set(
                    "reliefweb_pulse:last_fetch", str(time.time()), ex=RELIEFWEB_POLL_INTERVAL * 4
                )
            except Exception as e:
                logger.debug("Redis heartbeat write failed: %s", e)

    def _disable_reliefweb(self, reason: str):
        if self._reliefweb_disabled_reason == reason:
            return

        self._reliefweb_disabled_reason = reason
        logger.error(reason)

    async def _safe_reliefweb_error_body(self, resp: aiohttp.ClientResponse) -> str:
        try:
            return (await resp.text()).strip()
        except Exception as e:
            logger.debug("Failed to read ReliefWeb response body: %s", e)
            return ""
