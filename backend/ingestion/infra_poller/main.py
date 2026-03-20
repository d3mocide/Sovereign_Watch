import math
import os
import json
import time
import logging
import tempfile
import requests
import redis
import traceback
import zipfile
import csv
import io
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime, UTC

# Setup Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("InfraPoller")

# Config
REDIS_URL = os.getenv("REDIS_URL", "redis://sovereign-redis:6379/0")
DB_URL = os.getenv("DATABASE_URL", "postgresql://sovereign:watch@sovereign-db:5432/sovereign")
POLL_INTERVAL_CABLES_DAYS = 7
POLL_INTERVAL_IODA_MINUTES = 30
POLL_INTERVAL_FCC_DAYS = 7
# UTC hour (0-23) at which the weekly FCC sync is allowed to start.
# Defaults to 3 AM UTC to avoid contention with peak daytime track writes.
POLL_FCC_START_HOUR = int(os.getenv("POLL_FCC_START_HOUR", "3"))
# FCC migrated ASR bulk data from wireless2.fcc.gov -> data.fcc.gov.
# r_tower.zip = active Registrations (~35 MB). a_tower.zip = full Application history (~195 MB).
FCC_TOWERS_URL = "https://data.fcc.gov/download/pub/uls/complete/r_tower.zip"

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

def dms_to_decimal(deg_s, min_s, sec_s, dir_s):
    """Convert separate DMS fields to decimal degrees.

    data.fcc.gov r_tower.zip CO.dat format (confirmed):
      [6]=lat_deg  [7]=lat_min  [8]=lat_sec  [9]=lat_dir (N/S)
      [11]=lon_deg [12]=lon_min [13]=lon_sec [14]=lon_dir (E/W)
    """
    try:
        deg = float(deg_s)
        mins = float(min_s) if min_s and min_s.strip() else 0.0
        secs = float(sec_s) if sec_s and sec_s.strip() else 0.0
        direction = dir_s.strip().upper() if dir_s else ''
        if not direction:
            return None
        decimal = deg + (mins / 60.0) + (secs / 3600.0)
        if direction in ('S', 'W'):
            decimal = -decimal
        return decimal
    except (TypeError, ValueError):
        return None

FCC_DOWNLOAD_CHUNK_BYTES = 8 * 1024 * 1024  # 8 MB chunks
FCC_CONNECT_TIMEOUT_S    = 30               # fail fast if server won't accept
FCC_READ_TIMEOUT_S       = 120              # allow 2 min per chunk read
FCC_MAX_RETRIES          = 3


def _download_fcc_zip(dest_path: str) -> None:
    """Stream-download the FCC ASR zip to dest_path with retry/backoff."""
    for attempt in range(1, FCC_MAX_RETRIES + 1):
        try:
            logger.info("FCC download attempt %d/%d -> %s", attempt, FCC_MAX_RETRIES, FCC_TOWERS_URL)
            with requests.get(
                FCC_TOWERS_URL,
                stream=True,
                timeout=(FCC_CONNECT_TIMEOUT_S, FCC_READ_TIMEOUT_S),
            ) as resp:
                resp.raise_for_status()
                total = 0
                with open(dest_path, "wb") as fh:
                    for chunk in resp.iter_content(chunk_size=FCC_DOWNLOAD_CHUNK_BYTES):
                        if chunk:
                            fh.write(chunk)
                            total += len(chunk)
                            logger.debug("FCC download progress: %.1f MB", total / 1_000_000)
            logger.info("FCC zip downloaded: %.1f MB", total / 1_000_000)
            return  # success
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            logger.warning("FCC download attempt %d failed: %s", attempt, exc)
            if attempt < FCC_MAX_RETRIES:
                backoff = 30 * attempt
                logger.info("Retrying FCC download in %ds...", backoff)
                time.sleep(backoff)
            else:
                raise


def fetch_and_ingest_fcc_towers():
    logger.info("Starting FCC Towers ingestion...")
    tmp_path = None
    try:
        # Stream the zip to a temp file so we survive slow/flaky FCC servers
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            tmp_path = tmp.name

        _download_fcc_zip(tmp_path)

        records = []

        with zipfile.ZipFile(tmp_path) as z:
            # CO.dat contains the coordinate records
            if 'CO.dat' not in z.namelist():
                logger.error("CO.dat not found in FCC towers zip")
                return

            with z.open('CO.dat') as f:
                content = f.read().decode('latin1')
                reader = csv.reader(io.StringIO(content), delimiter='|')
                for row in reader:
                    # data.fcc.gov r_tower.zip CO.dat schema (18 columns):
                    # [0]=record_type [1]=REG [2]=file_num (FCC ID)
                    # [5]=coord_type (T=Tower)
                    # [6]=lat_deg [7]=lat_min [8]=lat_sec [9]=lat_dir
                    # [11]=lon_deg [12]=lon_min [13]=lon_sec [14]=lon_dir
                    if len(row) < 15:
                        continue

                    if row[0] != 'CO':
                        continue

                    # Only ingest Tower coordinate type
                    if row[5].strip() not in ('T', ''):
                        continue

                    fcc_id = row[2].strip()
                    if not fcc_id:
                        continue

                    lat = dms_to_decimal(row[6], row[7], row[8], row[9])
                    lon = dms_to_decimal(row[11], row[12], row[13], row[14])

                    if lat is None or lon is None:
                        continue
                    # Sanity-check: must be on Earth
                    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                        continue

                    records.append((
                        fcc_id,
                        lat,
                        lon,
                        None,   # elevation_m — not in CO.dat new schema
                        None,   # height_m   — not in CO.dat new schema
                    ))

        if not records:
            logger.warning("No valid FCC tower records found.")
            return

        # Deduplicate by fcc_id — CO.dat can contain repeated entries for the
        # same registration number. ON CONFLICT DO UPDATE cannot affect the same
        # row twice within one execute_values page, so deduplicate first.
        records_by_id = {r[0]: r for r in records}
        records = list(records_by_id.values())
        logger.info("Connecting to DB to insert %d unique towers...", len(records))
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()

        # Upsert logic — columns match init.sql infra_towers schema
        insert_query = """
            INSERT INTO infra_towers (fcc_id, lat, lon, elevation_m, height_m, geom)
            VALUES %s
            ON CONFLICT (fcc_id) DO UPDATE SET
                lat = EXCLUDED.lat,
                lon = EXCLUDED.lon,
                elevation_m = EXCLUDED.elevation_m,
                height_m = EXCLUDED.height_m,
                geom = EXCLUDED.geom,
                updated_at = CURRENT_TIMESTAMP;
        """

        # Prepare data with PostGIS geometry
        psycopg2_records = [
            (
                r[0], r[1], r[2], r[3], r[4],
                f"SRID=4326;POINT({r[2]} {r[1]})"
            )
            for r in records
        ]

        execute_values(cursor, insert_query, psycopg2_records, page_size=1000)
        conn.commit()
        cursor.close()
        conn.close()
        logger.info("Successfully ingested FCC Towers.")

    except Exception as e:
        logger.error("Failed to ingest FCC towers: %s", e)
        traceback.print_exc()
    finally:
        # Always clean up the temp file
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

def main():
    logger.info("Starting InfraPoller...")

    # IODA refreshes on every boot. 
    # FCC and Cables are persistent weekly updates.
    last_ioda_fetch = 0
    
    last_cables_fetch_str = redis_client.get("infra:last_cables_fetch")
    last_cables_fetch = float(last_cables_fetch_str) if last_cables_fetch_str else 0

    last_fcc_fetch_str = redis_client.get("infra:last_fcc_fetch")
    last_fcc_fetch = float(last_fcc_fetch_str) if last_fcc_fetch_str else 0

    now = time.time()
    
    # Cables Sync Check
    if last_cables_fetch > 0:
        elapsed = now - last_cables_fetch
        remaining = max(0, (POLL_INTERVAL_CABLES_DAYS * 86400) - elapsed)
        if remaining > 0:
            days = int(remaining // 86400)
            hours = int((remaining % 86400) // 3600)
            logger.info(f"Submarine Cables data is cached. Next sync in {days}d {hours}h.")
    else:
        logger.info("No cached Submarine Cables timestamp. Syncing shortly.")

    # FCC Sync Check
    if last_fcc_fetch > 0:
        elapsed = now - last_fcc_fetch
        remaining = max(0, (POLL_INTERVAL_FCC_DAYS * 86400) - elapsed)
        if remaining > 0:
            days = int(remaining // 86400)
            hours = int((remaining % 86400) // 3600)
            logger.info(f"FCC Towers data is cached. Next sync in {days}d {hours}h.")
    else:
        logger.info("No cached FCC timestamp. Syncing shortly.")

    while True:
        now = time.time()

        if now - last_cables_fetch > POLL_INTERVAL_CABLES_DAYS * 86400:
            fetch_cables_and_stations()
            last_cables_fetch = now
            redis_client.set("infra:last_cables_fetch", str(now))

        if now - last_ioda_fetch > POLL_INTERVAL_IODA_MINUTES * 60:
            fetch_internet_outages()
            last_ioda_fetch = now

        if now - last_fcc_fetch > POLL_INTERVAL_FCC_DAYS * 86400:
            current_hour = datetime.now(UTC).hour
            if current_hour == POLL_FCC_START_HOUR:
                fetch_and_ingest_fcc_towers()
                last_fcc_fetch = now
                redis_client.set("infra:last_fcc_fetch", str(now))
            else:
                logger.info(
                    "FCC sync due but deferring to %02d:00 UTC (currently %02d:00 UTC) "
                    "to avoid peak-hour disk contention.",
                    POLL_FCC_START_HOUR, current_hour,
                )

        time.sleep(60)

if __name__ == "__main__":
    main()
