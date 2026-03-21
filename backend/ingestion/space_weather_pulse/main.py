"""
Space Weather Pulse — NOAA SWPC ingestion service.

Polls two NOAA SWPC endpoints on a tight schedule:
  - Kp-index (1-minute cadence) every 15 minutes  → Redis + TimescaleDB
  - Auroral Oval GeoJSON every 5 minutes           → Redis (cached for frontend)

Redis keys written:
  space_weather:kp_current    — latest single Kp value as JSON {kp, storm_level, time}
  space_weather:kp_history    — last 24h series as JSON array
  space_weather:aurora_geojson — NOAA 1-hour auroral forecast GeoJSON

TimescaleDB writes:
  space_weather_kp hypertable — rolling 7-day Kp history for jamming correlation
"""

import json
import logging
import os
import time
from datetime import datetime, UTC

import psycopg2
from psycopg2.extras import execute_values
import redis
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("SpaceWeatherPulse")

REDIS_URL = os.getenv("REDIS_URL", "redis://sovereign-redis:6379/0")
DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@sovereign-timescaledb:5432/sovereign_watch",
)

# Poll intervals
AURORA_INTERVAL_S = int(os.getenv("AURORA_INTERVAL_S", "300"))    # 5 min
KP_INTERVAL_S = int(os.getenv("KP_INTERVAL_S", "900"))           # 15 min

# NOAA SWPC endpoints — all public, no auth required
KP_1M_URL = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json"
AURORA_URL = "https://services.swpc.noaa.gov/products/aurora-1-hour-forecast.json"

STORM_LEVELS = {
    0: "quiet", 1: "quiet", 2: "quiet",
    3: "unsettled", 4: "active",
    5: "G1", 6: "G2", 7: "G3", 8: "G4", 9: "G5",
}


def kp_to_storm_level(kp: float) -> str:
    return STORM_LEVELS.get(int(kp), "G5" if kp >= 9 else "quiet")


def fetch_kp() -> list[dict]:
    """Fetch 1-minute Kp index from NOAA. Returns list of {time, kp, kp_fraction}."""
    try:
        resp = requests.get(KP_1M_URL, timeout=15,
                            headers={"User-Agent": "SovereignWatch/1.0 (SpaceWeatherPulse)"})
        resp.raise_for_status()
        data = resp.json()
        records = []
        for row in data:
            # Format: [time_tag, kp, kp_fraction, ...] or dict
            if isinstance(row, list):
                time_tag = row[0]
                kp = float(row[1]) if row[1] is not None else None
                kp_frac = float(row[2]) if len(row) > 2 and row[2] is not None else kp
            elif isinstance(row, dict):
                time_tag = row.get("time_tag") or row.get("time")
                kp = float(row.get("kp_index", row.get("kp", 0)) or 0)
                kp_frac = float(row.get("kp", kp) or kp)
            else:
                continue
            if kp is None:
                continue
            records.append({"time": time_tag, "kp": kp, "kp_fraction": kp_frac})
        return records
    except Exception as e:
        logger.error("Failed to fetch Kp-index: %s", e)
        return []


def fetch_aurora() -> dict | None:
    """Fetch aurora 1-hour forecast GeoJSON from NOAA SWPC."""
    try:
        resp = requests.get(AURORA_URL, timeout=15,
                            headers={"User-Agent": "SovereignWatch/1.0 (SpaceWeatherPulse)"})
        resp.raise_for_status()
        data = resp.json()
        # NOAA returns an array: first element is header row, rest are [lon, lat, aurora_level]
        # We need to reshape this into a proper GeoJSON for the frontend
        if not isinstance(data, list) or len(data) < 2:
            return None

        # Check if it's already a GeoJSON FeatureCollection
        if isinstance(data, dict) and data.get("type") == "FeatureCollection":
            return data

        # NOAA aurora format: array of arrays [lon, lat, aurora_%]
        # Build a GeoJSON FeatureCollection of points with aurora intensity
        features = []
        for row in data:
            if not isinstance(row, list) or len(row) < 3:
                continue
            try:
                lon = float(row[0])
                lat = float(row[1])
                intensity = float(row[2]) if row[2] is not None else 0.0
                if intensity <= 0:
                    continue
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {"aurora": intensity},
                })
            except (TypeError, ValueError):
                continue

        return {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {"fetched_at": datetime.now(UTC).isoformat()},
        }
    except Exception as e:
        logger.error("Failed to fetch aurora GeoJSON: %s", e)
        return None


def store_kp_redis(redis_client: redis.Redis, records: list[dict]) -> None:
    """Update Redis with latest Kp value and 24h history."""
    if not records:
        return

    # Latest value
    latest = records[-1]
    kp_val = latest["kp"]
    storm = kp_to_storm_level(kp_val)
    current = {
        "kp": kp_val,
        "kp_fraction": latest.get("kp_fraction", kp_val),
        "storm_level": storm,
        "time": latest["time"],
        "fetched_at": datetime.now(UTC).isoformat(),
    }
    redis_client.set("space_weather:kp_current", json.dumps(current))

    # Last 24h history (up to 1440 1-minute samples)
    history = [
        {
            "time": r["time"],
            "kp": r["kp"],
            "storm_level": kp_to_storm_level(r["kp"]),
        }
        for r in records[-1440:]
    ]
    redis_client.set("space_weather:kp_history", json.dumps(history))
    logger.info("Kp stored in Redis — latest: %.1f (%s)", kp_val, storm)


def store_kp_db(db_url: str, records: list[dict]) -> None:
    """Persist new Kp records to TimescaleDB (skips duplicates by ON CONFLICT DO NOTHING)."""
    if not records:
        return
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        rows = [
            (r["time"], r["kp"], r.get("kp_fraction", r["kp"]),
             kp_to_storm_level(r["kp"]), "noaa_swpc_1m")
            for r in records
        ]
        execute_values(
            cur,
            """
            INSERT INTO space_weather_kp (time, kp, kp_fraction, storm_level, source)
            VALUES %s
            ON CONFLICT DO NOTHING
            """,
            rows,
            page_size=500,
        )
        conn.commit()
        cur.close()
        conn.close()
        logger.info("Persisted %d Kp records to TimescaleDB", len(rows))
    except Exception as e:
        logger.error("DB write failed for Kp records: %s", e)


def store_aurora_redis(redis_client: redis.Redis, geojson: dict) -> None:
    redis_client.set("space_weather:aurora_geojson", json.dumps(geojson))
    count = len(geojson.get("features", []))
    logger.info("Aurora GeoJSON stored in Redis (%d points)", count)


def main():
    logger.info("Space Weather Pulse starting...")

    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

    last_kp_fetch = 0.0
    last_aurora_fetch = 0.0

    # Track which Kp timestamps have been written to avoid duplicate inserts
    seen_kp_times: set[str] = set()

    while True:
        now = time.time()

        # --- Kp-index poll ---
        if now - last_kp_fetch >= KP_INTERVAL_S:
            records = fetch_kp()
            if records:
                store_kp_redis(redis_client, records)
                # Only write records not yet seen
                new_records = [r for r in records if r["time"] not in seen_kp_times]
                if new_records:
                    store_kp_db(DB_URL, new_records)
                    for r in new_records:
                        seen_kp_times.add(r["time"])
                    # Keep seen set bounded (1 week of 1-min samples = ~10 080 entries)
                    if len(seen_kp_times) > 15_000:
                        seen_kp_times.clear()
            last_kp_fetch = now

        # --- Aurora poll ---
        if now - last_aurora_fetch >= AURORA_INTERVAL_S:
            geojson = fetch_aurora()
            if geojson:
                store_aurora_redis(redis_client, geojson)
            last_aurora_fetch = now

        time.sleep(30)


if __name__ == "__main__":
    main()
