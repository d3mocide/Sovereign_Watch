"""
Orbital source — TLE fetch and SGP4 propagation.

Fetches TLE data from Celestrak for curated satellite groups, propagates
positions every 5 seconds using sgp4, and publishes TAK-format events to
the orbital_raw Kafka topic.

Two internal loops run concurrently inside run():
  tle_update_loop   — refreshes TLE data from Celestrak (every 6 hours)
  propagation_loop  — propagates positions and publishes to Kafka (every 5 s)
"""

import asyncio
import json
import logging
import math
import os
import time
from datetime import UTC, datetime, timedelta

import aiohttp
import numpy as np
from sgp4.api import Satrec, SatrecArray, jday
from utils import compute_course, ecef_to_lla_vectorized, teme_to_ecef_vectorized

logger = logging.getLogger("space_pulse.orbital")

# Allow non-container runtimes (e.g., CI runners) to override the cache path.
CACHE_DIR = os.getenv("SPACE_PULSE_CACHE_DIR", "/app/cache")
try:
    os.makedirs(CACHE_DIR, exist_ok=True)
except PermissionError:
    CACHE_DIR = "/tmp/space_pulse_cache"
    os.makedirs(CACHE_DIR, exist_ok=True)
    logger.warning("SPACE_PULSE_CACHE_DIR not writable, falling back to %s", CACHE_DIR)


def _read_file_sync(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _write_file_sync(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


class OrbitalSource:
    def __init__(self, producer, redis_client, topic):
        self.producer = producer
        self.redis_client = redis_client
        self.topic = topic
        self.running = True

        self.satrecs = []
        self.sat_meta = []
        self.sat_array = None

        self.fetch_interval_hours = 6
        self.fetch_hour = int(
            os.getenv("SPACE_TLE_FETCH_HOUR", os.getenv("ORBITAL_TLE_FETCH_HOUR", "2"))
        )
        self.propagate_interval_sec = 15

        self.groups = [
            ("gp.php", "gps-ops"),
            ("gp.php", "glonass-ops"),
            ("gp.php", "galileo"),
            ("gp.php", "beidou"),
            ("gp.php", "weather"),
            ("gp.php", "noaa"),
            ("gp.php", "goes"),
            ("gp.php", "sarsat"),
            ("gp.php", "starlink"),
            ("gp.php", "oneweb"),
            ("gp.php", "iridium-NEXT"),
            ("gp.php", "military"),
            ("gp.php", "amateur"),
            ("gp.php", "cubesat"),
            ("gp.php", "radarsat"),
            ("gp.php", "stations"),
            ("gp.php", "visual"),
            ("gp.php", "resource"),
            ("gp.php", "spire"),
            ("gp.php", "planet"),
        ]

        self.GROUP_CATEGORY_MAP = {
            "gps-ops": "gps",
            "glonass-ops": "gps",
            "galileo": "gps",
            "beidou": "gps",
            "weather": "weather",
            "noaa": "weather",
            "goes": "weather",
            "sarsat": "sar",
            "starlink": "comms",
            "oneweb": "comms",
            "iridium-NEXT": "comms",
            "military": "intel",
            "amateur": "comms",
            "cubesat": "leo",
            "radarsat": "intel",
            "stations": "leo",
            "visual": "leo",
            "resource": "weather",
            "spire": "intel",
            "planet": "intel",
        }

        self.GROUP_CONSTELLATION_MAP = {
            "gps-ops": "GPS",
            "glonass-ops": "GLONASS",
            "galileo": "Galileo",
            "beidou": "BeiDou",
            "noaa": "NOAA",
            "goes": "GOES",
            "sarsat": "SARSAT",
            "starlink": "Starlink",
            "oneweb": "OneWeb",
            "iridium-NEXT": "Iridium",
            "radarsat": "RADARSAT",
            "spire": "Spire",
            "planet": "Planet",
        }

    async def run(self):
        """Run TLE update and propagation loops concurrently."""
        await asyncio.gather(self.tle_update_loop(), self.propagation_loop())

    def _get_cache_path(self, endpoint, param_name, param_val):
        safe_endpoint = endpoint.replace("/", "_")
        return os.path.join(CACHE_DIR, f"{safe_endpoint}_{param_name}_{param_val}.txt")

    def _parse_tle_data(self, data_text, param_val):
        parsed = {}
        lines = [ln.strip() for ln in data_text.splitlines() if ln.strip()]
        for i in range(0, len(lines) - 2, 3):
            name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
            try:
                sat = Satrec.twoline2rv(l1, l2)
                norad_id = sat.satnum
                inc_deg = math.degrees(sat.inclo)
                period_min = (2 * math.pi / sat.no_kozai) if sat.no_kozai > 0 else 0
                parsed[norad_id] = {
                    "satrec": sat,
                    "meta": {
                        "name": name,
                        "norad_id": norad_id,
                        "category": self.GROUP_CATEGORY_MAP.get(param_val, param_val),
                        "constellation": self.GROUP_CONSTELLATION_MAP.get(param_val),
                        "period_min": period_min,
                        "inclination_deg": inc_deg,
                        "eccentricity": sat.ecco,
                        "tle_line1": l1,
                        "tle_line2": l2,
                    },
                }
            except Exception as exc:
                logger.warning("Failed to parse TLE for %s: %s", name, exc)
        return parsed

    async def fetch_tle_data(self):
        async with aiohttp.ClientSession() as session:
            sat_dict = {}
            for endpoint, param_val in self.groups:
                if not self.running:
                    break
                param_name = "FILE" if "sup-gp" in endpoint else "GROUP"
                cache_path = self._get_cache_path(endpoint, param_name, param_val)
                use_cache = False
                if os.path.exists(cache_path):
                    if time.time() - os.path.getmtime(cache_path) < 2 * 3600:
                        use_cache = True
                data_text = ""
                if use_cache:
                    data_text = await asyncio.to_thread(_read_file_sync, cache_path)
                    logger.info("Cache hit: %s", param_val)
                else:
                    url = f"https://celestrak.org/NORAD/elements/{endpoint}?{param_name}={param_val}&FORMAT=TLE"
                    try:
                        async with session.get(url) as resp:
                            if resp.status == 200:
                                data_text = await resp.text()
                                await asyncio.to_thread(
                                    _write_file_sync, cache_path, data_text
                                )
                                logger.info("Fetched TLE: %s", param_val)
                            elif resp.status in (403, 404):
                                logger.warning(
                                    "HTTP %d for %s. Skipping.", resp.status, url
                                )
                                continue
                            else:
                                logger.warning("Failed %s: HTTP %d", url, resp.status)
                                continue
                    except Exception as exc:
                        logger.error("Fetch error %s: %s", url, exc)
                        continue
                    await asyncio.sleep(1.0)

                parsed = await asyncio.to_thread(
                    self._parse_tle_data, data_text, param_val
                )
                sat_dict.update(parsed)

            self.satrecs = [v["satrec"] for v in sat_dict.values()]
            self.sat_meta = [v["meta"] for v in sat_dict.values()]
            if self.satrecs:
                self.sat_array = SatrecArray(self.satrecs)
            logger.info("Loaded %d unique satellites", len(self.satrecs))

    async def tle_update_loop(self):
        while self.running:
            if self.fetch_hour >= 0:
                current_hour = datetime.now(UTC).hour
                if current_hour != self.fetch_hour:
                    logger.info(
                        "Orbital TLE: deferring to %02d:00 UTC (now %02d:00 UTC).",
                        self.fetch_hour,
                        current_hour,
                    )
                    await asyncio.sleep(3600)
                    continue
            try:
                await self.fetch_tle_data()
                await self.redis_client.set(
                    "orbital_pulse:last_fetch", str(time.time()),
                    ex=self.fetch_interval_hours * 3600 * 4,
                )
            except Exception as exc:
                logger.error("TLE update error: %s", exc)
                try:
                    await self.redis_client.set(
                        "poller:orbital:last_error",
                        json.dumps({"ts": time.time(), "msg": str(exc)}),
                        ex=86400,
                    )
                except Exception:
                    pass
            await asyncio.sleep(self.fetch_interval_hours * 3600)

    async def propagation_loop(self):
        while self.running:
            if not self.satrecs or not self.sat_array:
                await asyncio.sleep(5)
                continue

            start_time = time.time()
            now = datetime.utcnow()
            jd, fr = jday(
                now.year,
                now.month,
                now.day,
                now.hour,
                now.minute,
                now.second + now.microsecond / 1e6,
            )
            ago = now - timedelta(seconds=1)
            jd_ago, fr_ago = jday(
                ago.year,
                ago.month,
                ago.day,
                ago.hour,
                ago.minute,
                ago.second + ago.microsecond / 1e6,
            )

            jd_arr = np.array([jd])
            fr_arr = np.array([fr])
            jd_ago_arr = np.array([jd_ago])
            fr_ago_arr = np.array([fr_ago])

            e_raw, r_raw, v_raw = self.sat_array.sgp4(jd_arr, fr_arr)
            e_ago_raw, r_ago_raw, _ = self.sat_array.sgp4(jd_ago_arr, fr_ago_arr)

            e = e_raw.reshape(-1)
            r = r_raw.reshape(-1, 3)
            v = v_raw.reshape(-1, 3)
            r_ago = r_ago_raw.reshape(-1, 3)

            valid_idx = np.where(e == 0)[0]
            if len(valid_idx) > 0:
                r_valid = r[valid_idx]
                r_ago_valid = r_ago[valid_idx]
                v_valid = v[valid_idx]

                r_ecef = teme_to_ecef_vectorized(r_valid, jd, fr)
                r_ago_ecef = teme_to_ecef_vectorized(r_ago_valid, jd_ago, fr_ago)

                lat, lon, alt = ecef_to_lla_vectorized(r_ecef)
                lat_ago, lon_ago, _ = ecef_to_lla_vectorized(r_ago_ecef)

                course = compute_course(lat_ago, lon_ago, lat, lon)
                speed = np.linalg.norm(v_valid, axis=1) * 1000  # km/s → m/s

                now_iso = now.isoformat() + "Z"
                stale_iso = (now + timedelta(minutes=1)).isoformat() + "Z"

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
                            "le": 1000.0,
                        },
                        "detail": {
                            "track": {
                                "course": round(float(course[i_valid]), 2),
                                "speed": round(float(speed[i_valid]), 2),
                            },
                            "contact": {"callsign": meta["name"].strip()},
                            "classification": meta,
                            "norad_id": meta["norad_id"],
                            "category": meta["category"],
                            "constellation": meta.get("constellation"),
                            "period_min": meta.get("period_min"),
                            "inclination_deg": meta.get("inclination_deg"),
                            "eccentricity": meta.get("eccentricity"),
                            # TLE lines removed from periodic updates to save bandwidth
                        },
                    }
                    batch_tasks.append(
                        self.producer.send(
                            self.topic,
                            value=tak_event,
                            key=tak_event["uid"].encode("utf-8"),
                        )
                    )
                    if len(batch_tasks) >= 500:
                        await asyncio.gather(*batch_tasks)
                        batch_tasks.clear()
                        await asyncio.sleep(0.1)

                if batch_tasks:
                    await asyncio.gather(*batch_tasks)

            elapsed = time.time() - start_time
            # Ensure at least 1 second of recovery sleep between heavy batches
            sleep_time = max(1.0, self.propagate_interval_sec - elapsed)
            logger.info(
                "Propagation: %d valid sats. Elapsed %.2fs. Sleeping %.2fs.",
                len(valid_idx),
                elapsed,
                sleep_time,
            )
            await asyncio.sleep(sleep_time)
