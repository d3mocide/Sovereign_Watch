import asyncio
import json
import logging
import math
import os
import time
from datetime import datetime, timedelta
import aiohttp
import numpy as np
from aiokafka import AIOKafkaProducer
from sgp4.api import Satrec, SatrecArray, jday

from utils import teme_to_ecef_vectorized, ecef_to_lla_vectorized, compute_course

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("orbital_pulse")

# Environment
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "sovereign-redpanda:9092")
REDIS_HOST = os.getenv("REDIS_HOST", "sovereign-redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
TOPIC_OUT = "orbital_raw"

CACHE_DIR = "/app/cache"
os.makedirs(CACHE_DIR, exist_ok=True)

class OrbitalPulseService:
    def __init__(self):
        self.running = True
        self.kafka_producer = None
        self.satrecs = []
        self.sat_meta = []
        self.sat_array = None

        # Fetched twice daily usually; every 6h loop checks HTTP cache locally
        self.fetch_interval_hours = 6
        self.propagate_interval_sec = 30

        # Curated groups only — 'active' (~9k unclassified sats) is intentionally excluded.
        # Supplemental GPS/GLONASS duplicates are also excluded to avoid redundant feeds.
        self.groups = [
            ("gp.php", "gps-ops"),
            ("gp.php", "glonass-ops"),
            ("gp.php", "galileo"),
            ("gp.php", "beidou"),
            ("gp.php", "weather"),
            ("gp.php", "noaa"),
        ]

        # Map Celestrak group names → clean user-facing category labels
        # These values must match the filter logic in TacticalMap.tsx
        self.GROUP_CATEGORY_MAP = {
            "gps-ops":    "gps",
            "glonass-ops": "gps",  # GLONASS is a GNSS system, maps to GPS category
            "galileo":    "gps",
            "beidou":     "gps",
            "weather":    "weather",
            "noaa":       "weather",
        }

    async def setup(self):
        # Configure AIOKafkaProducer with batching and lingering to significantly
        # lower CPU overhead from native python event loops pushing 14k messages.
        self.kafka_producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BROKERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            linger_ms=50
        )
        await self.kafka_producer.start()
        logger.info(f"📡 Kafka connected: {KAFKA_BROKERS}")

    async def shutdown(self):
        self.running = False
        if self.kafka_producer:
            await self.kafka_producer.stop()
        logger.info("🛑 Subagents shutdown complete")

    def _get_cache_path(self, endpoint, param_name, param_val):
        safe_endpoint = endpoint.replace("/", "_")
        return os.path.join(CACHE_DIR, f"{safe_endpoint}_{param_name}_{param_val}.txt")

    async def fetch_tle_data(self):
        """Fetch Celestrak data, honoring rate limits and caching"""
        async with aiohttp.ClientSession() as session:
            sat_dict = {} # Deduplicate by NORAD ID

            for endpoint, param_val in self.groups:
                if not self.running:
                    break

                param_name = "FILE" if "sup-gp" in endpoint else "GROUP"
                cache_path = self._get_cache_path(endpoint, param_name, param_val)

                # Check cache (2 hours valid)
                use_cache = False
                if os.path.exists(cache_path):
                    mtime = os.path.getmtime(cache_path)
                    if time.time() - mtime < 2 * 3600:
                        use_cache = True

                data_text = ""
                if use_cache:
                    with open(cache_path, "r", encoding="utf-8") as f:
                        data_text = f.read()
                    logger.info(f"💾 Used cache for {param_val} ({endpoint})")
                else:
                    url = f"https://celestrak.org/NORAD/elements/{endpoint}?{param_name}={param_val}&FORMAT=TLE"
                    try:
                        async with session.get(url) as resp:
                            if resp.status == 200:
                                data_text = await resp.text()
                                with open(cache_path, "w", encoding="utf-8") as f:
                                    f.write(data_text)
                                logger.info(f"🌐 Fetched {param_val} ({endpoint})")
                            elif resp.status in (403, 404):
                                logger.warning(f"HTTP {resp.status} for {url}. Skipping.")
                                continue
                            else:
                                logger.warning(f"Failed to fetch {url}: {resp.status}")
                                continue
                    except Exception as e:
                        logger.error(f"Fetch error {url}: {e}")
                        continue

                    # Prevent rapid requests
                    await asyncio.sleep(1.0)

                # Parse TLE
                lines = [line.strip() for line in data_text.splitlines() if line.strip()]
                for i in range(0, len(lines)-2, 3):
                    name = lines[i]
                    l1 = lines[i+1]
                    l2 = lines[i+2]

                    try:
                        sat = Satrec.twoline2rv(l1, l2)
                        norad_id = sat.satnum

                        inc_deg = math.degrees(sat.inclo)
                        # approximate period in minutes = 2pi / mean_motion, mean_motion is in rad/min
                        period_min = (2 * math.pi / sat.no_kozai) if sat.no_kozai > 0 else 0

                        # Use the clean category label, not the raw group name
                        category = self.GROUP_CATEGORY_MAP.get(param_val, param_val)

                        sat_dict[norad_id] = {
                            "satrec": sat,
                            "meta": {
                                "name": name,
                                "norad_id": norad_id,
                                "category": category,
                                "period_min": period_min,
                                "inclination_deg": inc_deg
                            }
                        }
                    except Exception as e:
                        logger.warning(f"Failed to parse TLE for {name}: {e}")

            # Prepare arrays for vectorized computation
            self.satrecs = [v["satrec"] for v in sat_dict.values()]
            self.sat_meta = [v["meta"] for v in sat_dict.values()]

            if self.satrecs:
                self.sat_array = SatrecArray(self.satrecs)
            logger.info(f"✅ Loaded {len(self.satrecs)} unique satellites")

    async def tle_update_loop(self):
        while self.running:
            try:
                await self.fetch_tle_data()
            except Exception as e:
                logger.error(f"Error in TLE update loop: {e}")
            await asyncio.sleep(self.fetch_interval_hours * 3600)

    async def propagation_loop(self):
        while self.running:
            if not self.satrecs or not self.sat_array:
                await asyncio.sleep(5)
                continue

            start_time = time.time()
            logger.info("Propagation: starting setup...")

            # Current time
            now = datetime.utcnow()
            jd, fr = jday(now.year, now.month, now.day, now.hour, now.minute, now.second + now.microsecond / 1e6)

            # 1 second ago
            ago = now - timedelta(seconds=1)
            jd_ago, fr_ago = jday(ago.year, ago.month, ago.day, ago.hour, ago.minute, ago.second + ago.microsecond / 1e6)

            # SatrecArray.sgp4 in recent versions requires jd/fr to be arrays.
            # Passing a 1-element array results in (n_sats, 1, 3) output.
            jd_arr = np.array([jd])
            fr_arr = np.array([fr])
            jd_ago_arr = np.array([jd_ago])
            fr_ago_arr = np.array([fr_ago])

            e_raw, r_raw, v_raw = self.sat_array.sgp4(jd_arr, fr_arr)
            e_ago_raw, r_ago_raw, v_ago_raw = self.sat_array.sgp4(jd_ago_arr, fr_ago_arr)

            # Flatten from (n_sats, 1, 3) -> (n_sats, 3) and (n_sats, 1) -> (n_sats,)
            e = e_raw.reshape(-1)
            r = r_raw.reshape(-1, 3)
            v = v_raw.reshape(-1, 3)
            
            e_ago = e_ago_raw.reshape(-1)
            r_ago = r_ago_raw.reshape(-1, 3)
            v_ago = v_ago_raw.reshape(-1, 3)

            # Filter errors
            valid_idx = np.where(e == 0)[0]

            if len(valid_idx) > 0:
                # Subset to valid satellites
                r_valid = r[valid_idx]
                r_ago_valid = r_ago[valid_idx]
                v_valid = v[valid_idx]

                # ECEF - teme_to_ecef_vectorized handles r as (N, 3) and jd/fr as scalars
                r_ecef = teme_to_ecef_vectorized(r_valid, jd, fr)
                r_ago_ecef = teme_to_ecef_vectorized(r_ago_valid, jd_ago, fr_ago)

                logger.info("Propagation: running LLA conversions...")
                # LLA
                lat, lon, alt = ecef_to_lla_vectorized(r_ecef)
                lat_ago, lon_ago, alt_ago = ecef_to_lla_vectorized(r_ago_ecef)

                logger.info("Propagation: running course math...")
                # Course & Speed
                course = compute_course(lat_ago, lon_ago, lat, lon)
                speed = np.linalg.norm(v_valid, axis=1) * 1000 # km/s to m/s

                now_iso = now.isoformat() + "Z"
                stale_iso = (now + timedelta(minutes=1)).isoformat() + "Z"

                logger.info("Propagation: publishing loop...")
                # Publish
                batch_tasks = []
                for i_valid, idx in enumerate(valid_idx):
                    meta = self.sat_meta[idx]

                    tak_event = {
                        "uid": f"SAT-{meta['norad_id']}",
                        "type": "a-s-K",
                        "how": "m-g",
                        "time": int(now.timestamp() * 1000),
                        "start": now_iso,
                        "stale": stale_iso,
                        "point": {
                            "lat": round(float(lat[i_valid]), 6),
                            "lon": round(float(lon[i_valid]), 6),
                            "hae": round(float(alt[i_valid] * 1000), 2),
                            "ce": 1000.0,
                            "le": 1000.0
                        },
                        "detail": {
                            "track": {
                                "course": round(float(course[i_valid]), 2),
                                "speed": round(float(speed[i_valid]), 2)
                            },
                            "contact": {
                                "callsign": meta['name'].strip()
                            },
                            "classification": meta # Maps to our requested detail dictionary internally or custom mapped
                        }
                    }

                    # Overwrite detail fields as requested:
                    tak_event["detail"]["norad_id"] = meta['norad_id']
                    tak_event["detail"]["category"] = meta['category']
                    tak_event["detail"]["period_min"] = meta['period_min']
                    tak_event["detail"]["inclination_deg"] = meta['inclination_deg']

                    # To kafka
                    batch_tasks.append(self.kafka_producer.send(
                        TOPIC_OUT,
                        value=tak_event,
                        key=tak_event["uid"].encode("utf-8")
                    ))

                    # Yield and await in small batches to reduce task allocation overhead
                    if len(batch_tasks) >= 500:
                        await asyncio.gather(*batch_tasks)
                        batch_tasks.clear()
                        await asyncio.sleep(0)

                if batch_tasks:
                    await asyncio.gather(*batch_tasks)

            elapsed = time.time() - start_time
            sleep_time = max(0.1, self.propagate_interval_sec - elapsed)
            logger.info(f"Propagation cycle finished. Valid elements: {len(valid_idx)}. Elapsed computation/send time: {elapsed:.2f}s. Sleeping for: {sleep_time:.2f}s.")
            await asyncio.sleep(sleep_time)
