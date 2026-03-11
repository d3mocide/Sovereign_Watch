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
POLL_INTERVAL_DC_HOURS = 24 * 7

# IODA
IODA_URL = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts"

# Data Centers
DC_URL = "https://raw.githubusercontent.com/Ringmast4r/Data-Center-Map---Global/main/datacenters.json"

# Submarine Cables
CABLES_URL = "https://www.submarinecablemap.com/api/v3/cable/cable-geo.json"
STATIONS_URL = "https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json"

# Connect to Redis
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)

# Geocoding Cache (simplified, but you could use OpenStreetMap Nominatim here if needed)
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
    logger.info("Fetching Internet Outages from IODA...")
    try:
        # Get last 24h
        now = int(time.time())
        from_time = now - (24 * 3600)

        # We need a proper time range, but the default URL is often enough. Let's use the default URL
        resp = requests.get(f"{IODA_URL}?from={from_time}&until={now}", timeout=30)
        resp.raise_for_status()

        data = resp.json().get("data", [])

        outages = []
        seen_regions = set()

        for alert in data:
            datasource = alert.get("datasource", "")
            if datasource not in ("bgp", "ping-slash24"):
                continue

            entity_type = alert.get("entity_type", "")
            if entity_type != "region":
                continue

            # Filter severity
            value = alert.get("value", 0)
            expected = alert.get("expected", 0)

            if expected == 0:
                continue

            severity = (1 - (value / expected)) * 100
            severity = max(0, min(100, severity))

            if severity < 10:
                continue

            region_code = alert.get("entity_code", "")
            country_code = alert.get("country_code", "")
            region_name = alert.get("entity_name", region_code)
            country_name = alert.get("country_name", country_code)

            dedup_key = f"{region_code}-{country_code}"
            if dedup_key in seen_regions:
                continue

            seen_regions.add(dedup_key)

            lat, lon = geocode_region(region_name, country_code)
            if lat == 0.0 and lon == 0.0:
                 continue # skip if we couldn't geocode

            outages.append({
                "region_code": region_code,
                "region_name": region_name,
                "country_code": country_code,
                "country_name": country_name,
                "level": "outage",
                "datasource": datasource,
                "severity": round(severity, 1),
                "lat": lat,
                "lng": lon
            })

            if len(outages) >= 100:
                break

        # Sort by severity descending
        outages.sort(key=lambda x: x["severity"], reverse=True)

        # Build GeoJSON
        features = []
        for o in outages:
            features.append({
                "type": "Feature",
                "properties": {
                    "id": f"outage-{o['region_code']}",
                    "region": o["region_name"],
                    "country": o["country_name"],
                    "severity": o["severity"],
                    "datasource": o["datasource"]
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [o["lng"], o["lat"]]
                }
            })

        geojson = {"type": "FeatureCollection", "features": features}

        redis_client.set("infra:outages", json.dumps(geojson))
        logger.info(f"Stored {len(features)} internet outages in Redis.")

    except Exception as e:
        logger.error(f"Failed to fetch internet outages: {e}")

def fix_dc_coords(lat, lon, country):
    southern_countries = ["Australia", "Brazil", "Argentina", "Chile", "South Africa", "New Zealand"]
    if country in southern_countries and lat > 0:
        lat = -lat
    return lat, lon

def fetch_datacenters():
    logger.info("Fetching Data Centers...")
    try:
        resp = requests.get(DC_URL, timeout=30)
        # If the direct URL fails (sometimes datasets move), we might need a fallback.
        data = []
        if resp.status_code == 200:
            try:
                data = resp.json()
            except json.JSONDecodeError:
                data = [] # Invalid JSON
        else:
             logger.warning(f"Failed to fetch DC data: {resp.status_code}")
             data = []

        features = []
        # Support different formats just in case
        items = data if isinstance(data, list) else data.get("datacenters", [])

        for dc in items:
            name = dc.get("name", "Unknown DC")
            company = dc.get("company", "Unknown")
            city = dc.get("city", "")
            country = dc.get("country", "")
            lat = float(dc.get("lat", 0))
            lon = float(dc.get("lng", dc.get("lon", 0)))

            lat, lon = fix_dc_coords(lat, lon, country)

            if lat == 0 and lon == 0:
                continue

            features.append({
                "type": "Feature",
                "properties": {
                    "id": f"dc-{name}-{city}".replace(" ", "-").lower(),
                    "name": name,
                    "company": company,
                    "city": city,
                    "country": country
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat]
                }
            })

        geojson = {"type": "FeatureCollection", "features": features}
        redis_client.set("infra:datacenters", json.dumps(geojson))
        logger.info(f"Stored {len(features)} datacenters in Redis.")

    except Exception as e:
        logger.error(f"Failed to fetch datacenters: {e}")

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
    last_dc_fetch = 0
    last_cables_fetch = 0

    while True:
        now = time.time()

        if now - last_cables_fetch > POLL_INTERVAL_CABLES_HOURS * 3600:
            fetch_cables_and_stations()
            last_cables_fetch = now

        if now - last_ioda_fetch > POLL_INTERVAL_IODA_MINUTES * 60:
            fetch_internet_outages()
            last_ioda_fetch = now

        if now - last_dc_fetch > POLL_INTERVAL_DC_HOURS * 3600:
            fetch_datacenters()
            last_dc_fetch = now

        time.sleep(60)

if __name__ == "__main__":
    main()
