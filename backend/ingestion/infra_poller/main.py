import os
import json
import time
import logging
import requests
import redis
import traceback
from datetime import datetime, timezone

# Setup Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("InfraPoller")

# Config
REDIS_URL = os.getenv("REDIS_URL", "redis://sovereign-redis:6379/0")
POLL_INTERVAL_CABLES_HOURS = 24
POLL_INTERVAL_IODA_MINUTES = 30

# IODA
IODA_URL = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/summary"

# Submarine Cables
CABLES_URL = "https://www.submarinecablemap.com/api/v3/cable/cable-geo.json"
STATIONS_URL = "https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json"

# Connect to Redis
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

# Geocoding Cache
_region_geocode_cache = {}

def geocode_region(region_name: str, country_code: str):
    cache_key = f"{region_name},{country_code}"
    if cache_key in _region_geocode_cache:
        return _region_geocode_cache[cache_key]

    try:
        query = f"{region_name}, {country_code}"
        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": query, "format": "json", "limit": 1}
        headers = {"User-Agent": "SovereignWatch/1.0 (InfraPoller)"}
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data:
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            _region_geocode_cache[cache_key] = (lat, lon)
            time.sleep(1) # Be nice to Nominatim
            return (lat, lon)
    except Exception as e:
        logger.error(f"Geocoding failed for {query}: {e}")

    # Fallback default if geocoding fails
    _region_geocode_cache[cache_key] = (0.0, 0.0)
    return (0.0, 0.0)

def fetch_internet_outages():
    logger.info("Fetching Internet Outage Summary from IODA...")
    try:
        # Get last 24h in UTC
        now = int(time.time())
        from_time = now - (24 * 3600)

        params = {
            "from": from_time,
            "until": now,
            "entityType": "country"
        }
        
        resp = requests.get(IODA_URL, params=params, timeout=30)
        resp.raise_for_status()
        
        data = resp.json().get("data", [])
        
        outages = []
        for entry in data:
            entity = entry.get("entity", {})
            if not entity:
                continue
                
            scores = entry.get("scores", {})
            # Use 'overall' score for severity
            overall_score = scores.get("overall", 0)
            if overall_score < 1000: # Ignore very minor noise
                continue

            # Check for IR
            country_code = entity.get("code", "")
            country_name = entity.get("name", country_code)
            
            # Normalize overall_score to 0-100 severity
            # Based on IODA scores (e.g., 350G is 3.5e11), we'll use a log scale
            # log10(1,000) = 3 -> 10% severity
            # log10(1,000,000,000,000) = 12 -> 100% severity
            import math
            log_score = math.log10(max(1, overall_score))
            severity = (log_score / 12.0) * 100
            severity = max(0, min(100, severity))

            # Geocode
            lat, lon = geocode_region(country_name, country_code)
            if lat == 0.0 and lon == 0.0:
                continue

            outages.append({
                "type": "Feature",
                "properties": {
                    "id": f"outage-{country_code}",
                    "region": country_name,
                    "country": country_name,
                    "country_code": country_code,
                    "severity": round(severity, 1),
                    "datasource": "IODA_OVERALL",
                    "entity_type": "country",
                    "score_raw": overall_score
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat]
                }
            })

            if len(outages) >= 200:
                break

        geojson = {"type": "FeatureCollection", "features": outages}
        redis_client.set("infra:outages", json.dumps(geojson))
        logger.info(f"Stored {len(outages)} internet outages in Redis from Summary.")

    except Exception as e:
        logger.error(f"Failed to fetch internet outages from summary: {e}")
        traceback.print_exc()

    except Exception as e:
        logger.error(f"Failed to fetch internet outages: {e}")


def fetch_cables_and_stations():
    logger.info("Fetching Submarine Cables and Landing Stations...")
    try:
        cables_resp = requests.get(CABLES_URL, timeout=30)
        cables_resp.raise_for_status()
        redis_client.set("infra:cables", json.dumps(cables_resp.json()))
        logger.info("Stored submarine cables in Redis.")

        stations_resp = requests.get(STATIONS_URL, timeout=30)
        stations_resp.raise_for_status()
        redis_client.set("infra:stations", json.dumps(stations_resp.json()))
        logger.info("Stored landing stations in Redis.")

    except Exception as e:
        logger.error(f"Failed to fetch cables/stations: {e}")

def main():
    logger.info("Starting InfraPoller...")

    last_ioda_fetch = 0
    last_cables_fetch = 0

    while True:
        now = time.time()

        if now - last_cables_fetch > POLL_INTERVAL_CABLES_HOURS * 3600:
            fetch_cables_and_stations()
            last_cables_fetch = now

        if now - last_ioda_fetch > POLL_INTERVAL_IODA_MINUTES * 60:
            fetch_internet_outages()
            last_ioda_fetch = now


        time.sleep(60)

if __name__ == "__main__":
    main()
