"""
InfraPoller — async infrastructure ingestion service.

Three independent async polling loops run concurrently:
  cables_loop   — Submarine cables + landing stations   (7-day interval → Redis)
  ioda_loop     — Internet outage summary from IODA     (30-min interval → Redis)
  fcc_loop      — FCC ASR tower registrations           (7-day interval, hour-gated → PostgreSQL)

All blocking I/O (psycopg2, zipfile/csv parsing) is offloaded to a thread pool
via asyncio.to_thread so the event loop stays responsive.  SIGINT/SIGTERM are
caught and trigger a clean shutdown.
"""

import asyncio
import csv
import io
import json
import logging
import math
import os
import signal
import socket
import struct
import tempfile
import time
import traceback
import zipfile
from datetime import UTC, datetime

import aiohttp
import psycopg2
import redis.asyncio as aioredis
from psycopg2.extras import execute_values

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("InfraPoller")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL", "redis://sovereign-redis:6379/0")
DB_URL = os.getenv("DATABASE_URL")
POLL_FCC_START_HOUR = int(os.getenv("POLL_FCC_START_HOUR", "3"))
POLL_INTERVAL_CABLES_DAYS = 7
POLL_INTERVAL_IODA_MINUTES = 30
POLL_INTERVAL_FCC_DAYS = 7

FCC_TOWERS_URL = "https://data.fcc.gov/download/pub/uls/complete/r_tower.zip"
IODA_URL = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/summary"
CABLES_URL = "https://www.submarinecablemap.com/api/v3/cable/cable-geo.json"
STATIONS_URL = (
    "https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json"
)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NDBC_LATEST_URL = "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt"
PEERINGDB_IXP_URL = "https://www.peeringdb.com/api/ix"
PEERINGDB_FAC_URL = "https://www.peeringdb.com/api/fac"

POLL_INTERVAL_NDBC_MINUTES = int(os.getenv("POLL_INTERVAL_NDBC_MINUTES", "15"))
POLL_INTERVAL_PEERINGDB_HOURS = int(os.getenv("POLL_INTERVAL_PEERINGDB_HOURS", "24"))
POLL_INTERVAL_NWS_MINUTES = int(os.getenv("POLL_INTERVAL_NWS_MINUTES", "10"))
POLL_INTERVAL_DNS_ROOT_MINUTES = int(os.getenv("POLL_INTERVAL_DNS_ROOT_MINUTES", "5"))

NWS_ALERTS_URL = "https://api.weather.gov/alerts/active"
NWS_USER_AGENT = "SovereignWatch/1.0 (infra-poller; contact@sovereign.watch)"

# The 13 IANA root DNS server clusters (authoritative primary IPv4 + nominal location).
# These are anycast clusters; the IP always routes to the nearest instance.
DNS_ROOT_SERVERS = [
    {"letter": "A", "operator": "Verisign",  "ip": "198.41.0.4",     "lat": 38.9695,  "lon": -77.3861},
    {"letter": "B", "operator": "USC-ISI",   "ip": "199.9.14.201",   "lat": 33.9802,  "lon": -118.4517},
    {"letter": "C", "operator": "Cogent",    "ip": "192.33.4.12",    "lat": 38.9695,  "lon": -77.3861},
    {"letter": "D", "operator": "UMD",       "ip": "199.7.91.13",    "lat": 38.9807,  "lon": -76.9369},
    {"letter": "E", "operator": "NASA",      "ip": "192.203.230.10", "lat": 37.4149,  "lon": -122.0650},
    {"letter": "F", "operator": "ISC",       "ip": "192.5.5.241",    "lat": 37.3861,  "lon": -122.0839},
    {"letter": "G", "operator": "DISA",      "ip": "192.112.36.4",   "lat": 39.9612,  "lon": -82.9988},
    {"letter": "H", "operator": "ARL",       "ip": "198.97.190.53",  "lat": 39.5093,  "lon": -76.1644},
    {"letter": "I", "operator": "Netnod",    "ip": "192.36.148.17",  "lat": 59.3293,  "lon": 18.0686},
    {"letter": "J", "operator": "Verisign",  "ip": "192.58.128.30",  "lat": 38.9531,  "lon": -77.4565},
    {"letter": "K", "operator": "RIPE NCC",  "ip": "193.0.14.129",   "lat": 52.3728,  "lon": 4.8936},
    {"letter": "L", "operator": "ICANN",     "ip": "199.7.83.42",    "lat": 34.0522,  "lon": -118.2437},
    {"letter": "M", "operator": "WIDE",      "ip": "202.12.27.33",   "lat": 35.6762,  "lon": 139.6503},
]
# Maximum haversine distance (km) for IODA outage ↔ cable landing correlation
IODA_CABLE_CORRELATION_KM = 300.0

FCC_DOWNLOAD_CHUNK_BYTES = 1 * 1024 * 1024  # 1 MB
FCC_CONNECT_TIMEOUT_S = 30
FCC_READ_TIMEOUT_S = 120
FCC_MAX_RETRIES = 5

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


# ---------------------------------------------------------------------------
# Pure helpers — no I/O, unit-testable directly
# ---------------------------------------------------------------------------


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
        direction = dir_s.strip().upper() if dir_s else ""
        if not direction:
            return None
        decimal = deg + (mins / 60.0) + (secs / 3600.0)
        if direction in ("S", "W"):
            decimal = -decimal
        return decimal
    except (TypeError, ValueError):
        return None


def parse_float(s: str):
    """Return a float from a pipe-delimited FCC field, or None if empty/invalid."""
    if not s or not s.strip():
        return None
    try:
        return float(s.strip())
    except ValueError:
        return None


def ioda_severity(overall_score: float) -> float:
    """Normalise IODA overall score to 0-100 severity on a log scale."""
    log_score = math.log10(max(1, overall_score))
    return max(0.0, min(100.0, (log_score / 12.0) * 100))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in km between two (lat, lon) points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def normalize_country_label(value: str | None) -> str:
    """Normalize country labels for cross-source matching."""
    if not value:
        return ""
    chars = [char.lower() if char.isalnum() else " " for char in str(value)]
    return " ".join("".join(chars).split())


def parse_ioda_outages(data: list) -> list[dict]:
    """Parse IODA v2 summary data into a list of Feature dicts.

    Filters for overall scores >= 1000 and calculates severity.
    """
    outages = []
    for entry in data:
        entity = entry.get("entity", {})
        if not entity:
            continue
        overall_score = entry.get("scores", {}).get("overall", 0)
        if overall_score < 1000:
            continue

        country_code = entity.get("code", "")
        country_name = entity.get("name", country_code)
        severity = ioda_severity(overall_score)

        outages.append({
            "code": country_code,
            "name": country_name,
            "severity": round(severity, 1),
            "score_raw": overall_score,
        })
    return outages


def extract_station_country(name: str | None) -> str:
    """Extract the country portion from a landing-point display name."""
    if not name:
        return ""
    parts = [part.strip() for part in str(name).split(",") if part.strip()]
    return parts[-1] if parts else ""


def flatten_line_strings(geometry: dict) -> list[list[list[float]]]:
    """Return coordinate sequences for LineString or MultiLineString geometry."""
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if geom_type == "LineString":
        return [coords] if len(coords) >= 2 else []
    if geom_type == "MultiLineString":
        return [line for line in coords if len(line) >= 2]
    return []


def build_cable_country_index(cables_geojson: dict, stations_geojson: dict) -> dict:
    """Build a persisted cable-country topology index from landing points and cables."""
    countries: dict[str, dict] = {}
    cable_index: dict[str, dict] = {}
    station_points: list[dict] = []

    for feature in stations_geojson.get("features", []):
        geometry = feature.get("geometry", {})
        coords = geometry.get("coordinates") or []
        if geometry.get("type") != "Point" or len(coords) < 2:
            continue
        name = feature.get("properties", {}).get("name", "")
        country = extract_station_country(name)
        country_key = normalize_country_label(country)
        if not country_key:
            continue
        station = {
            "name": name,
            "lat": float(coords[1]),
            "lon": float(coords[0]),
        }
        station_points.append({"country_key": country_key, **station})
        bucket = countries.setdefault(
            country_key,
            {
                "country": country,
                "landing_names": [],
                "station_points": [],
                "cable_ids": [],
            },
        )
        bucket["landing_names"].append(name)
        bucket["station_points"].append(station)

    for feature in cables_geojson.get("features", []):
        properties = feature.get("properties", {})
        cable_id = properties.get("id") or properties.get("feature_id") or properties.get("name")
        if not cable_id:
            continue

        countries_for_cable: set[str] = set()
        for line in flatten_line_strings(feature.get("geometry", {})):
            endpoints = [line[0], line[-1]]
            for endpoint in endpoints:
                if len(endpoint) < 2:
                    continue
                endpoint_lon, endpoint_lat = float(endpoint[0]), float(endpoint[1])
                for station in station_points:
                    if haversine_km(endpoint_lat, endpoint_lon, station["lat"], station["lon"]) <= IODA_CABLE_CORRELATION_KM:
                        countries_for_cable.add(station["country_key"])

        cable_index[cable_id] = {
            "name": properties.get("name") or cable_id,
            "countries": sorted(countries_for_cable),
        }
        for country_key in countries_for_cable:
            countries.setdefault(
                country_key,
                {
                    "country": country_key,
                    "landing_names": [],
                    "station_points": [],
                    "cable_ids": [],
                },
            )["cable_ids"].append(cable_id)

    for entry in countries.values():
        entry["landing_names"] = sorted(set(entry["landing_names"]))
        entry["cable_ids"] = sorted(set(entry["cable_ids"]))

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "countries": countries,
        "cables": cable_index,
    }


# ---------------------------------------------------------------------------
# Blocking helpers — called via asyncio.to_thread
# ---------------------------------------------------------------------------


def _parse_fcc_zip_sync(tmp_path: str) -> list[tuple]:
    """Parse EN.dat, RA.dat, CO.dat from the FCC ASR zip.

    Returns a deduplicated list of tuples:
      (fcc_id, lat, lon, elevation_m, height_m, owner)
    """
    with zipfile.ZipFile(tmp_path) as z:
        names = z.namelist()

        # EN.dat — entity / owner names
        owner_by_usi: dict[str, str] = {}
        if "EN.dat" in names:
            logger.info("Parsing EN.dat for owner names...")
            with z.open("EN.dat") as f:
                content = f.read().decode("latin1")
            for row in csv.reader(io.StringIO(content), delimiter="|"):
                if len(row) > 9 and row[0] == "EN":
                    usi = row[3].strip()
                    name = row[9].strip()
                    if usi and name:
                        owner_by_usi[usi] = name
            logger.info("Loaded %d owner records from EN.dat", len(owner_by_usi))

        # RA.dat — registration / structure dimensions
        ra_by_usi: dict[str, tuple] = {}
        if "RA.dat" in names:
            logger.info("Parsing RA.dat for height/elevation...")
            with z.open("RA.dat") as f:
                content = f.read().decode("latin1")
            for row in csv.reader(io.StringIO(content), delimiter="|"):
                if len(row) > 30 and row[0] == "RA":
                    usi = row[3].strip()
                    if usi and usi not in ra_by_usi:
                        ra_by_usi[usi] = (parse_float(row[28]), parse_float(row[30]))
            logger.info("Loaded %d structure records from RA.dat", len(ra_by_usi))

        # CO.dat — coordinates
        if "CO.dat" not in names:
            logger.error("CO.dat not found in FCC towers zip")
            return []

        logger.info("Parsing CO.dat for coordinates...")
        records: list[tuple] = []
        with z.open("CO.dat") as f:
            content = f.read().decode("latin1")
        for row in csv.reader(io.StringIO(content), delimiter="|"):
            if len(row) < 15 or row[0] != "CO":
                continue
            if row[5].strip() not in ("T", ""):
                continue
            usi = row[3].strip()
            fcc_id = row[2].strip()
            if not usi or not fcc_id:
                continue
            lat = dms_to_decimal(row[6], row[7], row[8], row[9])
            lon = dms_to_decimal(row[11], row[12], row[13], row[14])
            if lat is None or lon is None:
                continue
            if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                continue
            elev_m, height_m = ra_by_usi.get(usi, (None, None))
            records.append((fcc_id, lat, lon, elev_m, height_m, owner_by_usi.get(usi)))

    # Deduplicate by fcc_id — CO.dat can repeat entries for the same registration
    deduped = list({r[0]: r for r in records}.values())
    logger.info("Parsed %d unique tower records from FCC zip", len(deduped))
    return deduped


def _ingest_fcc_records_sync(db_url: str, records: list[tuple]) -> None:
    """Upsert FCC tower records into infra_towers via psycopg2 (blocking)."""
    insert_sql = """
        INSERT INTO infra_towers (fcc_id, lat, lon, elevation_m, height_m, owner, geom)
        VALUES %s
        ON CONFLICT (fcc_id) DO UPDATE SET
            lat         = EXCLUDED.lat,
            lon         = EXCLUDED.lon,
            elevation_m = EXCLUDED.elevation_m,
            height_m    = EXCLUDED.height_m,
            owner       = EXCLUDED.owner,
            geom        = EXCLUDED.geom,
            updated_at  = CURRENT_TIMESTAMP
    """
    rows = [
        (r[0], r[1], r[2], r[3], r[4], r[5], f"SRID=4326;POINT({r[2]} {r[1]})")
        for r in records
    ]
    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        execute_values(cur, insert_sql, rows, page_size=1000)
        conn.commit()
        cur.close()
    finally:
        conn.close()
    logger.info("Upserted %d FCC tower records into infra_towers", len(records))


# ---------------------------------------------------------------------------
# NDBC helpers — pure + blocking, unit-testable without I/O
# ---------------------------------------------------------------------------


def _ndbc_field(value: str):
    """Return float from an NDBC field, or None if the field is 'MM' / empty."""
    v = value.strip()
    if not v or v == "MM":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def parse_ndbc_latest_obs(text: str) -> list[dict]:
    """Parse NDBC latest_obs.txt into a list of observation dicts.

    Column order (space-separated, two header lines starting with '#'):
      STN  LAT  LON  YEAR  MM  DD  hh  mm  WDIR  WSPD  GST  WVHT  DPD  APD  MWD  PRES  ATMP  WTMP  DEWP  VIS  TIDE
    Returns only rows that have a valid lat, lon, and at least one measurement.
    """
    records = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 18:
            continue
        try:
            buoy_id = parts[0]
            lat = float(parts[1])
            lon = float(parts[2])
            year = int(parts[3])
            month = int(parts[4])
            day = int(parts[5])
            hour = int(parts[6])
            minute = int(parts[7])
        except (ValueError, IndexError):
            continue

        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            continue

        wvht_m = _ndbc_field(parts[11])
        wtmp_c = _ndbc_field(parts[17])
        wspd_ms = _ndbc_field(parts[9])
        wdir_deg = _ndbc_field(parts[8])
        atmp_c = _ndbc_field(parts[16])
        pres_hpa = _ndbc_field(parts[15])

        # Skip rows with no usable measurements
        if all(v is None for v in (wvht_m, wtmp_c, wspd_ms)):
            continue

        try:
            obs_time = datetime(year, month, day, hour, minute, tzinfo=UTC)
        except ValueError:
            continue

        records.append(
            {
                "buoy_id": buoy_id,
                "time": obs_time,
                "lat": lat,
                "lon": lon,
                "wvht_m": wvht_m,
                "wtmp_c": wtmp_c,
                "wspd_ms": wspd_ms,
                "wdir_deg": wdir_deg,
                "atmp_c": atmp_c,
                "pres_hpa": pres_hpa,
            }
        )
    return records


def _ingest_ndbc_records_sync(db_url: str, records: list[dict]) -> int:
    """Upsert NDBC observations into ndbc_obs via psycopg2 (blocking).

    Uses ON CONFLICT DO NOTHING — duplicate (buoy_id, time) rows from
    back-to-back 15-minute fetches are silently skipped.
    Returns the number of rows inserted.
    """
    insert_sql = """
        INSERT INTO ndbc_obs
            (time, buoy_id, lat, lon, wvht_m, wtmp_c, wspd_ms, wdir_deg, atmp_c, pres_hpa, geom)
        VALUES %s
        ON CONFLICT DO NOTHING
    """
    rows = [
        (
            r["time"],
            r["buoy_id"],
            r["lat"],
            r["lon"],
            r["wvht_m"],
            r["wtmp_c"],
            r["wspd_ms"],
            r["wdir_deg"],
            r["atmp_c"],
            r["pres_hpa"],
            f"SRID=4326;POINT({r['lon']} {r['lat']})",
        )
        for r in records
    ]
    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        execute_values(cur, insert_sql, rows, page_size=500)
        conn.commit()
        inserted = cur.rowcount
        cur.close()
    finally:
        conn.close()
    return inserted


# ---------------------------------------------------------------------------
# PeeringDB helpers — pure + blocking, unit-testable without I/O
# ---------------------------------------------------------------------------


def parse_peeringdb_ixps(data: dict) -> list[dict]:
    """Parse PeeringDB /api/ix response into a list of IXP dicts.

    Returns only records with a non-empty name and valid lat/lon coordinates
    read directly from the IXP item (PeeringDB /api/ix includes these).
    """
    records = []
    for item in data.get("data", []):
        try:
            ixp_id = int(item["id"])
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            _lat = item.get("lat")
            lat_raw = _lat if _lat is not None else item.get("latitude")
            _lon = item.get("lon")
            lon_raw = _lon if _lon is not None else item.get("longitude")
            if lat_raw is None or lon_raw is None:
                continue
            lat = float(lat_raw)
            lon = float(lon_raw)
            if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                continue
            records.append(
                {
                    "ixp_id": ixp_id,
                    "name": name,
                    "name_long": str(item.get("name_long", "") or "").strip() or None,
                    "city": str(item.get("city", "") or "").strip() or None,
                    "country": str(item.get("country", "") or "").strip() or None,
                    "website": str(item.get("website", "") or "").strip() or None,
                    "lat": lat,
                    "lon": lon,
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return records


def build_peeringdb_facility_location_index(records: list[dict]) -> dict[tuple[str, str], tuple[float, float]]:
    """Build a city/country centroid lookup from parsed facility records."""
    buckets: dict[tuple[str, str], list[tuple[float, float]]] = {}
    for record in records:
        city_key = normalize_country_label(record.get("city"))
        country_key = normalize_country_label(record.get("country"))
        lat = record.get("lat")
        lon = record.get("lon")
        if not city_key or not country_key or lat is None or lon is None:
            continue
        buckets.setdefault((city_key, country_key), []).append((float(lat), float(lon)))

    return {
        key: (
            sum(lat for lat, _ in coords) / len(coords),
            sum(lon for _, lon in coords) / len(coords),
        )
        for key, coords in buckets.items()
    }


def enrich_peeringdb_ixps_with_facility_locations(
    data: dict,
    location_index: dict[tuple[str, str], tuple[float, float]],
) -> list[dict]:
    """Backfill IXP coordinates from facility centroids when the API omits lat/lon."""
    records = []
    for item in data.get("data", []):
        try:
            ixp_id = int(item["id"])
            name = str(item.get("name", "")).strip()
            if not name:
                continue

            _lat = item.get("lat")
            lat_raw = _lat if _lat is not None else item.get("latitude")
            _lon = item.get("lon")
            lon_raw = _lon if _lon is not None else item.get("longitude")

            if lat_raw is None or lon_raw is None:
                city_key = normalize_country_label(item.get("city"))
                country_key = normalize_country_label(item.get("country"))
                inferred = location_index.get((city_key, country_key))
                if inferred is None:
                    continue
                lat, lon = inferred
            else:
                lat = float(lat_raw)
                lon = float(lon_raw)

            if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                continue

            records.append(
                {
                    "ixp_id": ixp_id,
                    "name": name,
                    "name_long": str(item.get("name_long", "") or "").strip() or None,
                    "city": str(item.get("city", "") or "").strip() or None,
                    "country": str(item.get("country", "") or "").strip() or None,
                    "website": str(item.get("website", "") or "").strip() or None,
                    "lat": lat,
                    "lon": lon,
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return records


def parse_peeringdb_facilities(data: dict) -> list[dict]:
    """Parse PeeringDB /api/fac response into a list of facility dicts.

    Returns only records with valid lat/lon.
    """
    records = []
    for item in data.get("data", []):
        try:
            fac_id = int(item["id"])
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            _lat = item.get("lat")
            lat_raw = _lat if _lat is not None else item.get("latitude")
            _lon = item.get("lon")
            lon_raw = _lon if _lon is not None else item.get("longitude")
            if lat_raw is None or lon_raw is None:
                continue
            lat = float(lat_raw)
            lon = float(lon_raw)
            if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                continue
            records.append(
                {
                    "fac_id": fac_id,
                    "name": name,
                    "city": str(item.get("city", "") or "").strip() or None,
                    "country": str(item.get("country", "") or "").strip() or None,
                    "website": str(item.get("website", "") or "").strip() or None,
                    "org_name": str(item.get("org", {}).get("name", "") or "").strip() or None
                    if isinstance(item.get("org"), dict)
                    else None,
                    "lat": lat,
                    "lon": lon,
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return records


def parse_iss_position(data: dict) -> dict | None:
    """Parse an open-notify ISS position API response.

    Returns a dict with lat, lon, time, altitude_km, velocity_kms, or None
    if the response is missing required fields or contains invalid values.
    """
    if data.get("message") != "success":
        return None
    pos = data.get("iss_position")
    if not pos:
        return None
    try:
        lat = float(pos["latitude"])
        lon = float(pos["longitude"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return None
    try:
        t = datetime.fromtimestamp(int(data["timestamp"]), tz=UTC)
    except (KeyError, TypeError, ValueError, OSError):
        t = None
    return {
        "lat": lat,
        "lon": lon,
        "time": t,
        "altitude_km": None,
        "velocity_kms": None,
    }


def _upsert_iss_position_sync(db_url: str, pos: dict) -> None:
    """Upsert the latest ISS position into the iss_positions hypertable."""
    insert_sql = """
        INSERT INTO iss_positions (time, lat, lon, altitude_km, velocity_kms, geom)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        cur.execute(
            insert_sql,
            (
                pos["time"],
                pos["lat"],
                pos["lon"],
                pos["altitude_km"],
                pos["velocity_kms"],
                f"SRID=4326;POINT({pos['lon']} {pos['lat']})",
            ),
        )
        conn.commit()
        cur.close()
    finally:
        conn.close()


def _upsert_peeringdb_ixps_sync(db_url: str, records: list[dict]) -> int:
    """Upsert PeeringDB IXP records into peeringdb_ixps (blocking)."""
    insert_sql = """
        INSERT INTO peeringdb_ixps
            (ixp_id, name, name_long, city, country, website, lat, lon, geom)
        VALUES %s
        ON CONFLICT (ixp_id) DO UPDATE SET
            name       = EXCLUDED.name,
            name_long  = EXCLUDED.name_long,
            city       = EXCLUDED.city,
            country    = EXCLUDED.country,
            website    = EXCLUDED.website,
            lat        = EXCLUDED.lat,
            lon        = EXCLUDED.lon,
            geom       = EXCLUDED.geom,
            updated_at = CURRENT_TIMESTAMP
    """
    rows = [
        (
            r["ixp_id"],
            r["name"],
            r["name_long"],
            r["city"],
            r["country"],
            r["website"],
            r["lat"],
            r["lon"],
            f"SRID=4326;POINT({r['lon']} {r['lat']})",
        )
        for r in records
    ]
    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        execute_values(cur, insert_sql, rows, page_size=500)
        conn.commit()
        count = cur.rowcount
        cur.close()
    finally:
        conn.close()
    return count


def _upsert_peeringdb_fac_sync(db_url: str, records: list[dict]) -> int:
    """Upsert PeeringDB facility records into peeringdb_facilities (blocking)."""
    insert_sql = """
        INSERT INTO peeringdb_facilities
            (fac_id, name, city, country, website, org_name, lat, lon, geom)
        VALUES %s
        ON CONFLICT (fac_id) DO UPDATE SET
            name       = EXCLUDED.name,
            city       = EXCLUDED.city,
            country    = EXCLUDED.country,
            website    = EXCLUDED.website,
            org_name   = EXCLUDED.org_name,
            lat        = EXCLUDED.lat,
            lon        = EXCLUDED.lon,
            geom       = EXCLUDED.geom,
            updated_at = CURRENT_TIMESTAMP
    """
    rows = [
        (
            r["fac_id"],
            r["name"],
            r["city"],
            r["country"],
            r["website"],
            r["org_name"],
            r["lat"],
            r["lon"],
            f"SRID=4326;POINT({r['lon']} {r['lat']})",
        )
        for r in records
    ]
    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        execute_values(cur, insert_sql, rows, page_size=500)
        conn.commit()
        count = cur.rowcount
        cur.close()
    finally:
        conn.close()
    return count


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


def _probe_dns_sync(ip: str, timeout: float = 2.0) -> tuple[bool, float]:
    """Send a minimal DNS query for root NS records to *ip*:53; return (reachable, latency_ms).

    Builds the smallest valid DNS query: QID=1, RD=1, QDCOUNT=1, QNAME=. (root),
    QTYPE=NS(2), QCLASS=IN(1).  No third-party library required.
    """
    # Header: ID=1, flags=0x0100 (RD set), QDCOUNT=1, all other counts=0
    query = struct.pack(">HHHHHH", 1, 0x0100, 1, 0, 0, 0) + b"\x00" + struct.pack(">HH", 2, 1)
    sock = None
    start = time.monotonic()
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        sock.sendto(query, (ip, 53))
        data = sock.recv(512)
        latency_ms = (time.monotonic() - start) * 1000
        # Validate: response ID must match and QR bit (0x8000) must be set
        if len(data) >= 4 and data[0:2] == b"\x00\x01" and (data[2] & 0x80):
            return True, round(latency_ms, 1)
        return False, round(latency_ms, 1)
    except OSError:
        return False, -1.0
    finally:
        if sock:
            sock.close()


class InfraPollerService:
    def __init__(self):
        self.running = True
        self.redis = None
        self._geocode_cache: dict[str, tuple[float, float]] = {}
        self._ndbc_etag: str | None = None

    async def setup(self):
        self.redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
        logger.info("InfraPoller: Redis connected")

    async def run(self):
        tasks = [
            asyncio.create_task(self.cables_loop()),
            asyncio.create_task(self.ioda_loop()),
            asyncio.create_task(self.fcc_loop()),
            asyncio.create_task(self.ndbc_loop()),
            asyncio.create_task(self.peeringdb_loop()),
            asyncio.create_task(self.nws_loop()),
            asyncio.create_task(self.dns_root_loop()),
        ]
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            pass

    # -----------------------------------------------------------------------
    # Network Helpers
    # -----------------------------------------------------------------------

    async def fetch_api(self, client, url, log_tag, cache_key=None, ttl=86400, max_retries=3):
        """Helper to fetch from an API with caching, retry, and timeout handling."""
        # 1. Cache Check
        if cache_key:
            cached = await self.redis.get(cache_key)
            if cached:
                logger.info("[%s] Using cached data for %s", log_tag, url)
                return json.loads(cached)

        # 2. Fetch with Retry
        timeout = aiohttp.ClientTimeout(total=45.0)  # Generous timeout for slow APIs
        for attempt in range(max_retries):
            try:
                async with client.get(url, timeout=timeout) as resp:
                    if resp.status == 429:
                        wait = (attempt + 1) * 60
                        logger.warning(
                            "[%s] 429 Too Many Requests for %s, waiting %ds (attempt %d/%d)",
                            log_tag, url, wait, attempt + 1, max_retries
                        )
                        await asyncio.sleep(wait)
                        continue
                    
                    resp.raise_for_status()
                    data = await resp.json()

                    # 3. Cache Save
                    if cache_key:
                        await self.redis.set(cache_key, json.dumps(data), ex=ttl)
                    
                    return data
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                wait = (attempt + 1) * 5
                logger.warning("[%s] Fetch failed for %s (attempt %d/%d): %s. Retrying in %ds...", 
                             log_tag, url, attempt + 1, max_retries, exc, wait)
                await asyncio.sleep(wait)
        
        raise Exception(f"[{log_tag}] Failed to fetch {url} after {max_retries} attempts.")

    async def geocode_region(self, region_name: str | None, country_code: str | None) -> tuple[float, float]:
        """Resolve a country/region name to representative coordinates via Nominatim."""
        normalized_name = (region_name or "").strip()
        normalized_code = (country_code or "").strip().lower()
        cache_key = f"{normalized_code}:{normalized_name.casefold()}"
        cached = self._geocode_cache.get(cache_key)
        if cached is not None:
            return cached

        if not normalized_name:
            return (0.0, 0.0)

        params = {
            "q": normalized_name,
            "format": "jsonv2",
            "limit": 1,
        }
        if len(normalized_code) == 2:
            params["countrycodes"] = normalized_code

        timeout = aiohttp.ClientTimeout(total=15.0)
        try:
            async with aiohttp.ClientSession(
                timeout=timeout,
                headers={"User-Agent": USER_AGENT},
            ) as client:
                async with client.get(NOMINATIM_URL, params=params) as resp:
                    resp.raise_for_status()
                    results = await resp.json()
        except Exception as exc:
            logger.warning(
                "Geocoding failed for %s (%s): %s",
                normalized_name,
                country_code,
                exc,
            )
            return (0.0, 0.0)

        if not isinstance(results, list) or not results:
            return (0.0, 0.0)

        first = results[0]
        try:
            lat = float(first["lat"])
            lon = float(first["lon"])
        except (KeyError, TypeError, ValueError):
            return (0.0, 0.0)

        coords = (lat, lon)
        self._geocode_cache[cache_key] = coords
        return coords

    async def shutdown(self):
        logger.info("InfraPoller: shutting down...")
        self.running = False

    # -----------------------------------------------------------------------
    # Cables + landing stations loop — 7-day interval
    # -----------------------------------------------------------------------

    async def cables_loop(self):
        interval_s = POLL_INTERVAL_CABLES_DAYS * 86400

        while self.running:
            try:
                last_fetch = await self.redis.get("infra:last_cables_fetch")
                if last_fetch:
                    elapsed = time.time() - float(last_fetch)
                    if elapsed < interval_s:
                        remaining = interval_s - elapsed
                        logger.info(
                            "Cables loop: cooldown active. Next fetch in %dd %dh.",
                            int(remaining // 86400),
                            int((remaining % 86400) // 3600),
                        )
                        await asyncio.sleep(remaining)
                        continue

                await self._fetch_cables_and_stations()
                await self.redis.set("infra:last_cables_fetch", str(time.time()))
            except Exception as e:
                logger.exception("Cables fetch error")
                try:
                    await self.redis.set(
                        "poller:infra_cables:last_error",
                        json.dumps({"ts": time.time(), "msg": str(e)}),
                        ex=86400,
                    )
                except Exception:
                    pass
            await asyncio.sleep(interval_s)

    async def _fetch_cables_and_stations(self):
        logger.info("Fetching submarine cables and landing stations...")
        timeout = aiohttp.ClientTimeout(total=30.0)
        async with aiohttp.ClientSession(
            timeout=timeout, headers={"User-Agent": USER_AGENT}
        ) as client:
            async with client.get(CABLES_URL) as cables_resp:
                cables_resp.raise_for_status()
                cables_text = await cables_resp.text()
                await self.redis.set("infra:cables", cables_text)
            logger.info("Stored submarine cables in Redis")

            async with client.get(STATIONS_URL) as stations_resp:
                stations_resp.raise_for_status()
                stations_text = await stations_resp.text()
                await self.redis.set("infra:stations", stations_text)
            logger.info("Stored landing stations in Redis")

        try:
            cable_index = build_cable_country_index(
                json.loads(cables_text),
                json.loads(stations_text),
            )
            await self.redis.set("infra:cable_country_index", json.dumps(cable_index))
            logger.info(
                "Stored cable-country index in Redis (%d cables, %d countries)",
                len(cable_index.get("cables", {})),
                len(cable_index.get("countries", {})),
            )
        except Exception as exc:
            logger.warning("Failed to build cable-country index: %s", exc)

    # -----------------------------------------------------------------------
    # IODA loop — 30-minute interval
    # -----------------------------------------------------------------------

    async def ioda_loop(self):
        # Always fetch on boot; no persistent cooldown for IODA
        while self.running:
            try:
                await self._fetch_internet_outages()
            except Exception:
                logger.exception("IODA fetch error")
            await asyncio.sleep(POLL_INTERVAL_IODA_MINUTES * 60)

    async def _fetch_internet_outages(self):
        logger.info("Fetching internet outage summary from IODA...")
        now = int(time.time())
        from_time = now - (24 * 3600)

        timeout = aiohttp.ClientTimeout(total=30.0)
        async with aiohttp.ClientSession(
            timeout=timeout, headers={"User-Agent": USER_AGENT}
        ) as client:
            async with client.get(
                IODA_URL,
                params={"from": from_time, "until": now, "entityType": "country"},
            ) as resp:
                resp.raise_for_status()
                parsed = await resp.json()
                data = parsed.get("data", [])

        raw_outages = parse_ioda_outages(data)
        outages = []

        for o in raw_outages:
            lat, lon = await self.geocode_region(o["name"], o["code"])
            if lat == 0.0 and lon == 0.0:
                continue

            outages.append(
                {
                    "type": "Feature",
                    "properties": {
                        "id": f"outage-{o['code']}",
                        "region": o["name"],
                        "country": o["name"],
                        "country_code": o["code"],
                        "severity": o["severity"],
                        "datasource": "IODA_OVERALL",
                        "entity_type": "country",
                        "score_raw": o["score_raw"],
                    },
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                }
            )
            if len(outages) >= 200:
                break

        # Correlate each outage with nearby submarine cable landing points
        stations_raw = await self.redis.get("infra:stations")
        if stations_raw:
            try:
                stations_geojson = json.loads(stations_raw)
                landing_points = [
                    {
                        "name": f.get("properties", {}).get("name", ""),
                        "lon": f["geometry"]["coordinates"][0],
                        "lat": f["geometry"]["coordinates"][1],
                    }
                    for f in stations_geojson.get("features", [])
                    if f.get("geometry", {}).get("type") == "Point"
                    and len(f["geometry"]["coordinates"]) >= 2
                ]
                for feature in outages:
                    o_lon, o_lat = feature["geometry"]["coordinates"]
                    nearby = [
                        lp["name"]
                        for lp in landing_points
                        if haversine_km(o_lat, o_lon, lp["lat"], lp["lon"]) <= IODA_CABLE_CORRELATION_KM
                    ]
                    feature["properties"]["nearby_cable_landings"] = nearby[:10]
            except Exception as exc:
                logger.warning("IODA/cable correlation failed: %s", exc)

        geojson = {"type": "FeatureCollection", "features": outages}
        await self.redis.set("infra:outages", json.dumps(geojson))
        logger.info("Stored %d internet outages in Redis", len(outages))

    # -----------------------------------------------------------------------
    # FCC loop — 7-day interval, hour-gated
    # -----------------------------------------------------------------------

    async def fcc_loop(self):
        last_fetch_str = await self.redis.get("infra:last_fcc_fetch")
        last_fetch = float(last_fetch_str) if last_fetch_str else 0.0
        interval_s = POLL_INTERVAL_FCC_DAYS * 86400

        if last_fetch > 0:
            remaining = interval_s - (time.time() - last_fetch)
            if remaining > 0:
                logger.info(
                    "FCC towers: cached, next sync in %dd %dh",
                    int(remaining // 86400),
                    int((remaining % 86400) // 3600),
                )
                await asyncio.sleep(remaining)

        while self.running:
            current_hour = datetime.now(UTC).hour
            if POLL_FCC_START_HOUR != -1 and current_hour != POLL_FCC_START_HOUR:
                logger.info(
                    "FCC sync due but deferring to %02d:00 UTC (currently %02d:00 UTC).",
                    POLL_FCC_START_HOUR,
                    current_hour,
                )
                await asyncio.sleep(3600)
                continue

            try:
                await self._fetch_and_ingest_fcc_towers()
                await self.redis.set("infra:last_fcc_fetch", str(time.time()))
            except Exception as e:
                logger.exception("FCC towers ingestion error")
                try:
                    await self.redis.set(
                        "poller:infra_towers:last_error",
                        json.dumps({"ts": time.time(), "msg": str(e)}),
                        ex=86400,
                    )
                except Exception:
                    pass
            await asyncio.sleep(interval_s)

    async def _download_fcc_zip(self, dest_path: str) -> None:
        """Stream-download the FCC ASR zip with retry/backoff."""
        timeout = aiohttp.ClientTimeout(
            sock_connect=FCC_CONNECT_TIMEOUT_S, sock_read=FCC_READ_TIMEOUT_S
        )
        for attempt in range(1, FCC_MAX_RETRIES + 1):
            try:
                logger.info("FCC download attempt %d/%d", attempt, FCC_MAX_RETRIES)
                async with aiohttp.ClientSession(
                    timeout=timeout, headers={"User-Agent": USER_AGENT}
                ) as client:
                    async with client.get(FCC_TOWERS_URL) as resp:
                        resp.raise_for_status()
                        total = 0
                        with open(dest_path, "wb") as fh:
                            async for chunk in resp.content.iter_chunked(
                                FCC_DOWNLOAD_CHUNK_BYTES
                            ):
                                fh.write(chunk)
                                total += len(chunk)
                                logger.info("FCC download: %.1f MB", total / 1_000_000)
                logger.info("FCC zip downloaded: %.1f MB total", total / 1_000_000)
                return
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                logger.warning("FCC download attempt %d failed: %s", attempt, exc)
                if attempt < FCC_MAX_RETRIES:
                    backoff = 30 * attempt
                    logger.info("Retrying FCC download in %ds...", backoff)
                    await asyncio.sleep(backoff)
                else:
                    raise

    async def _fetch_and_ingest_fcc_towers(self):
        logger.info("Starting FCC Towers ingestion...")
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
                tmp_path = tmp.name

            # Async network download
            await self._download_fcc_zip(tmp_path)

            # Blocking ZIP/CSV parse — offload to thread pool
            records = await asyncio.to_thread(_parse_fcc_zip_sync, tmp_path)
            if not records:
                logger.warning("No valid FCC tower records found")
                return

            # Blocking DB write — offload to thread pool
            await asyncio.to_thread(_ingest_fcc_records_sync, DB_URL, records)
            logger.info("FCC Towers ingestion complete")

        except Exception:
            logger.error("FCC towers ingestion failed")
            traceback.print_exc()
        finally:
            if tmp_path:
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    # -----------------------------------------------------------------------
    # NDBC loop — 15-minute interval, ETag caching
    # -----------------------------------------------------------------------

    async def ndbc_loop(self):
        """Poll NDBC latest_obs.txt every 15 minutes, write to ndbc_obs table."""
        interval_s = POLL_INTERVAL_NDBC_MINUTES * 60
        while self.running:
            try:
                await self._fetch_and_ingest_ndbc()
                await self.redis.set("infra:last_ndbc_fetch", str(time.time()))
            except Exception as e:
                logger.exception("NDBC fetch error")
                try:
                    await self.redis.set(
                        "poller:ndbc:last_error",
                        json.dumps({"ts": time.time(), "msg": str(e)}),
                        ex=86400,
                    )
                except Exception:
                    pass
            await asyncio.sleep(interval_s)

    async def _fetch_and_ingest_ndbc(self):
        """Download latest_obs.txt (ETag-cached), parse, and upsert into DB."""
        headers = {"User-Agent": USER_AGENT}
        if self._ndbc_etag:
            headers["If-None-Match"] = self._ndbc_etag

        timeout = aiohttp.ClientTimeout(total=30.0)
        async with aiohttp.ClientSession(timeout=timeout, headers=headers) as client:
            async with client.get(NDBC_LATEST_URL) as resp:
                if resp.status == 304:
                    logger.info("NDBC: 304 Not Modified — no new data")
                    return
                resp.raise_for_status()
                text = await resp.text(encoding="utf-8", errors="replace")
                self._ndbc_etag = resp.headers.get("ETag")

        records = parse_ndbc_latest_obs(text)
        if not records:
            logger.warning("NDBC: no valid observations parsed")
            return

        inserted = await asyncio.to_thread(_ingest_ndbc_records_sync, DB_URL, records)
        logger.info("NDBC: parsed %d obs, inserted %d new rows", len(records), inserted)

        # Cache the latest observation GeoJSON for fast API reads
        features = [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
                "properties": {
                    "buoy_id": r["buoy_id"],
                    "wvht_m": r["wvht_m"],
                    "wtmp_c": r["wtmp_c"],
                    "wspd_ms": r["wspd_ms"],
                    "wdir_deg": r["wdir_deg"],
                    "atmp_c": r["atmp_c"],
                    "pres_hpa": r["pres_hpa"],
                    "time": r["time"].isoformat(),
                },
            }
            for r in records
        ]
        geojson = json.dumps({"type": "FeatureCollection", "features": features})
        await self.redis.set("ndbc:latest_obs", geojson, ex=1800)  # 30-min TTL
        logger.info("NDBC: cached %d buoys in Redis (ndbc:latest_obs)", len(features))

    # -----------------------------------------------------------------------
    # PeeringDB loop — 24-hour interval
    # -----------------------------------------------------------------------

    async def peeringdb_loop(self):
        """Fetch IXPs + facilities from PeeringDB every 24 hours."""
        last_fetch_str = await self.redis.get("infra:last_peeringdb_fetch")
        last_fetch = float(last_fetch_str) if last_fetch_str else 0.0
        interval_s = POLL_INTERVAL_PEERINGDB_HOURS * 3600
        stats_raw = await self.redis.get("infra:peeringdb_stats")
        should_refetch_immediately = False
        if stats_raw:
            try:
                stats = json.loads(stats_raw)
                should_refetch_immediately = int(stats.get("ixp_count", 0)) == 0
            except (TypeError, ValueError, json.JSONDecodeError):
                should_refetch_immediately = False

        if last_fetch > 0 and not should_refetch_immediately:
            remaining = interval_s - (time.time() - last_fetch)
            if remaining > 0:
                logger.info(
                    "PeeringDB: cached, next sync in %dh %dm",
                    int(remaining // 3600),
                    int((remaining % 3600) // 60),
                )
                await asyncio.sleep(remaining)
        elif should_refetch_immediately:
            logger.info("PeeringDB: previous IXP ingest was empty, bypassing cooldown for recovery.")

        while self.running:
            try:
                await self._fetch_and_ingest_peeringdb()
                await self.redis.set("infra:last_peeringdb_fetch", str(time.time()))
            except Exception as e:
                logger.exception("PeeringDB fetch error")
                try:
                    await self.redis.set(
                        "poller:peeringdb:last_error",
                        json.dumps({"ts": time.time(), "msg": str(e)}),
                        ex=86400,
                    )
                except Exception:
                    pass
            await asyncio.sleep(interval_s)

    async def _fetch_and_ingest_peeringdb(self):
        logger.info("Fetching PeeringDB IXPs and facilities...")
        headers = {"User-Agent": USER_AGENT}

        async with aiohttp.ClientSession(headers=headers) as client:
            # --- IXPs ---
            ix_data = await self.fetch_api(client, PEERINGDB_IXP_URL, "PeeringDB", 
                                         cache_key="infra:raw_peeringdb_ix", max_retries=5)
            await asyncio.sleep(6)  # Be polite

            # --- Facilities ---
            fac_data = await self.fetch_api(client, PEERINGDB_FAC_URL, "PeeringDB", 
                                          cache_key="infra:raw_peeringdb_fac", max_retries=5)
            await asyncio.sleep(6)


        fac_records = parse_peeringdb_facilities(fac_data)
        facility_location_index = build_peeringdb_facility_location_index(fac_records)
        ixp_records = enrich_peeringdb_ixps_with_facility_locations(ix_data, facility_location_index)

        if ixp_records:
            ixp_count = await asyncio.to_thread(
                _upsert_peeringdb_ixps_sync, DB_URL, ixp_records
            )
            logger.info(
                "PeeringDB: upserted %d IXPs (parsed %d, inferred via facilities where needed)",
                ixp_count,
                len(ixp_records),
            )
        else:
            logger.warning("PeeringDB: no valid IXP records parsed")

        if fac_records:
            fac_count = await asyncio.to_thread(
                _upsert_peeringdb_fac_sync, DB_URL, fac_records
            )
            logger.info(
                "PeeringDB: upserted %d facilities (parsed %d)", fac_count, len(fac_records)
            )
        else:
            logger.warning("PeeringDB: no valid facility records parsed")

        # Cache lightweight summaries (count + last-updated) for health checks
        await self.redis.set(
            "infra:peeringdb_stats",
            json.dumps(
                {
                    "ixp_count": len(ixp_records),
                    "fac_count": len(fac_records),
                    "fetched_at": time.time(),
                }
            ),
            ex=86400 * 2,
        )


    # -----------------------------------------------------------------------
    # NWS Atmospheric Alerts loop — 10-minute interval
    # -----------------------------------------------------------------------

    async def nws_loop(self):
        """Poll NWS active alerts every 10 minutes; write to ``nws:alerts:active``."""
        interval_s = POLL_INTERVAL_NWS_MINUTES * 60
        while self.running:
            try:
                await self._fetch_nws_alerts()
                await self.redis.set("infra:last_nws_fetch", str(time.time()))
            except Exception:
                logger.exception("NWS alerts fetch error")
            await asyncio.sleep(interval_s)

    async def _fetch_nws_alerts(self):
        """
        Fetch NWS active weather alerts (status=actual, limit=500).

        Redis keys written:
          nws:alerts:active   — GeoJSON FeatureCollection of active alerts (10-min TTL)
          nws:alerts:summary  — {count, severe_count, extreme_count, fetched_at} (10-min TTL)
        """
        logger.info("Fetching NWS active alerts...")
        timeout = aiohttp.ClientTimeout(total=20.0)
        headers = {
            "User-Agent": NWS_USER_AGENT,
            "Accept": "application/geo+json",
        }
        # /alerts/active already scopes to active alerts; weather.gov rejects
        # unsupported query params like limit with HTTP 400.
        params = {"status": "actual"}

        async with aiohttp.ClientSession(timeout=timeout, headers=headers) as client:
            async with client.get(NWS_ALERTS_URL, params=params) as resp:
                resp.raise_for_status()
                data = await resp.json(content_type=None)

        features = data.get("features", [])
        severe_count = sum(
            1 for f in features
            if f.get("properties", {}).get("severity") in ("Severe", "Extreme")
        )
        extreme_count = sum(
            1 for f in features
            if f.get("properties", {}).get("severity") == "Extreme"
        )

        ttl = POLL_INTERVAL_NWS_MINUTES * 60 + 60
        await self.redis.set("nws:alerts:active", json.dumps(data), ex=ttl)
        summary = {
            "count": len(features),
            "severe_count": severe_count,
            "extreme_count": extreme_count,
            "fetched_at": datetime.now(UTC).isoformat(),
        }
        await self.redis.set("nws:alerts:summary", json.dumps(summary), ex=ttl)
        logger.info(
            "NWS alerts stored in Redis: %d total, %d severe, %d extreme",
            len(features), severe_count, extreme_count,
        )


    # -----------------------------------------------------------------------
    # DNS Root Server Health loop — 5-minute interval
    # -----------------------------------------------------------------------

    async def dns_root_loop(self):
        """Probe all 13 root DNS clusters every 5 min; write to ``dns:root:health``."""
        interval_s = POLL_INTERVAL_DNS_ROOT_MINUTES * 60
        while self.running:
            try:
                await self._fetch_dns_root_health()
            except Exception:
                logger.exception("DNS root health probe error")
            await asyncio.sleep(interval_s)

    async def _fetch_dns_root_health(self):
        """Probe each root DNS server via UDP and persist results to Redis.

        Redis key written:
          dns:root:health  — list of {letter, operator, ip, lat, lon,
                              reachable, latency_ms, checked_at}
        """
        checked_at = datetime.now(UTC).isoformat()
        results = []
        for srv in DNS_ROOT_SERVERS:
            reachable, latency_ms = await asyncio.to_thread(_probe_dns_sync, srv["ip"])
            results.append({
                "letter": srv["letter"],
                "operator": srv["operator"],
                "ip": srv["ip"],
                "lat": srv["lat"],
                "lon": srv["lon"],
                "reachable": reachable,
                "latency_ms": latency_ms,
                "checked_at": checked_at,
            })
            logger.debug(
                "DNS root %s (%s) → reachable=%s latency=%.1fms",
                srv["letter"], srv["ip"], reachable, latency_ms,
            )
        ttl = POLL_INTERVAL_DNS_ROOT_MINUTES * 60 + 60
        await self.redis.set("dns:root:health", json.dumps(results), ex=ttl)
        reachable_count = sum(1 for r in results if r["reachable"])
        logger.info("DNS root health: %d/%d clusters reachable", reachable_count, len(results))

    # -----------------------------------------------------------------------
    # Entry point
# ---------------------------------------------------------------------------


async def main():
    svc = InfraPollerService()
    loop = asyncio.get_running_loop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(svc.shutdown()))

    await svc.setup()
    await svc.run()


if __name__ == "__main__":
    asyncio.run(main())
