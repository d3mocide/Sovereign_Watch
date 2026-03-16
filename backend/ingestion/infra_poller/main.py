import math
import os
import json
import time
import logging
import requests
import redis
import traceback
import zipfile
import io
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime, timezone

# Setup Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("InfraPoller")

# Config
REDIS_URL = os.getenv("REDIS_URL", "redis://sovereign-redis:6379/0")
DB_URL = os.getenv("DB_DSN", "postgresql://sovereign:tactical123@sovereign-db:5432/sovereign")
POLL_INTERVAL_CABLES_HOURS = 24
POLL_INTERVAL_IODA_MINUTES = 30
POLL_INTERVAL_FCC_HOURS = 168 # 1 week

# FCC ASR
FCC_ASR_URL = "https://wireless.fcc.gov/uls/data/complete/l_tower.zip"

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

def dms_to_dd(d, m, s, dir):
    """Convert Degrees, Minutes, Seconds to Decimal Degrees."""
    try:
        dd = float(d) + float(m)/60 + float(s)/3600
        if dir in ['S', 'W']:
            dd *= -1
        return dd
    except ValueError:
        return None

def fetch_fcc_asr():
    """Download and process the FCC ASR database (l_tower.zip)."""
    logger.info(f"Downloading FCC ASR data from {FCC_ASR_URL} ...")
    try:
        resp = requests.get(FCC_ASR_URL, stream=True, timeout=60)
        resp.raise_for_status()

        # Read zip directly into memory
        z = zipfile.ZipFile(io.BytesIO(resp.content))

        # We need EN.dat (Entity/Owner), RA.dat (Registration/Status), CO.dat (Coordinates/Height)

        owners = {}
        if 'EN.dat' in z.namelist():
            logger.info("Parsing EN.dat (Owners)...")
            with z.open('EN.dat') as f:
                for line in f:
                    parts = line.decode('iso-8859-1').split('|')
                    if len(parts) > 10 and parts[0] == 'EN':
                        reg_num = parts[4].strip()
                        # Use Entity Name, if empty try First/Last
                        name = parts[7].strip()
                        if not name:
                            name = f"{parts[8].strip()} {parts[10].strip()}".strip()
                        owners[reg_num] = name

        # Map reg_num -> (type, height_m, lat, lon)
        towers = {}

        if 'CO.dat' in z.namelist():
            logger.info("Parsing CO.dat (Coordinates/Heights)...")
            with z.open('CO.dat') as f:
                for line in f:
                    parts = line.decode('iso-8859-1').split('|')
                    if len(parts) > 20 and parts[0] == 'CO':
                        reg_num = parts[4].strip()

                        lat_d = parts[6].strip()
                        lat_m = parts[7].strip()
                        lat_s = parts[8].strip()
                        lat_dir = parts[9].strip()

                        lon_d = parts[10].strip()
                        lon_m = parts[11].strip()
                        lon_s = parts[12].strip()
                        lon_dir = parts[13].strip()

                        lat = dms_to_dd(lat_d, lat_m, lat_s, lat_dir)
                        lon = dms_to_dd(lon_d, lon_m, lon_s, lon_dir)

                        height = parts[14].strip() # Overall Height Above Ground (AGL)

                        if lat is not None and lon is not None and height:
                            try:
                                height_m = float(height)
                                towers[reg_num] = {
                                    "lat": lat,
                                    "lon": lon,
                                    "height_m": height_m,
                                    "type": "UNKNOWN" # Will update from RA
                                }
                            except ValueError:
                                pass

        valid_towers = []
        if 'RA.dat' in z.namelist():
            logger.info("Parsing RA.dat (Registration/Status)...")
            with z.open('RA.dat') as f:
                for line in f:
                    parts = line.decode('iso-8859-1').split('|')
                    if len(parts) > 10 and parts[0] == 'RA':
                        reg_num = parts[4].strip()
                        status = parts[6].strip() # G = Granted, C = Constructed
                        # Filter for active/constructed towers
                        if status in ['G', 'C'] and reg_num in towers:
                            struc_type = parts[34].strip() if len(parts) > 34 else "UNKNOWN"
                            owner = owners.get(reg_num, "UNKNOWN")
                            t = towers[reg_num]
                            valid_towers.append((
                                reg_num,
                                struc_type,
                                t["height_m"],
                                owner,
                                f"SRID=4326;POINT({t['lon']} {t['lat']})"
                            ))

        logger.info(f"Parsed {len(valid_towers)} valid FCC towers. Upserting to database...")

        if valid_towers:
            conn = psycopg2.connect(DB_URL)
            cursor = conn.cursor()

            insert_query = """
                INSERT INTO infra_towers (reg_num, type, height_m, owner, geom)
                VALUES %s
                ON CONFLICT (reg_num) DO UPDATE SET
                    type = EXCLUDED.type,
                    height_m = EXCLUDED.height_m,
                    owner = EXCLUDED.owner,
                    geom = EXCLUDED.geom,
                    updated_at = NOW()
            """

            execute_values(cursor, insert_query, valid_towers, page_size=5000)
            conn.commit()
            cursor.close()
            conn.close()
            logger.info("Successfully updated FCC ASR towers in database.")

    except Exception as e:
        logger.error(f"Failed to fetch/process FCC ASR data: {e}")
        traceback.print_exc()

def main():
    logger.info("Starting InfraPoller...")

    last_ioda_fetch = 0
    last_cables_fetch = 0
    last_fcc_fetch = 0

    while True:
        now = time.time()

        if now - last_cables_fetch > POLL_INTERVAL_CABLES_HOURS * 3600:
            fetch_cables_and_stations()
            last_cables_fetch = now

        if now - last_ioda_fetch > POLL_INTERVAL_IODA_MINUTES * 60:
            fetch_internet_outages()
            last_ioda_fetch = now

        if now - last_fcc_fetch > POLL_INTERVAL_FCC_HOURS * 3600:
            fetch_fcc_asr()
            last_fcc_fetch = now

        time.sleep(60)

if __name__ == "__main__":
    main()
