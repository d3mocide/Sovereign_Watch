"""
NASA FIRMS (Fire Information for Resource Management System) source.

Polls the FIRMS NRT Area API for VIIRS/MODIS thermal hotspot detections
and persists them to TimescaleDB for dark vessel cross-reference.

Data path:
  FIRMS Area API (CSV) → parse + filter → TimescaleDB firms_hotspots
                                        → Redis cache (firms:latest_geojson)

API reference: https://firms.modaps.eosdis.nasa.gov/api/area/
Endpoint: GET /api/area/csv/{MAP_KEY}/{source}/{W,S,E,N}/{days}

VIIRS CSV columns:
  latitude, longitude, bright_ti4, scan, track, acq_date, acq_time,
  satellite, instrument, confidence, version, bright_ti5, frp, daynight

MODIS CSV columns:
  latitude, longitude, brightness, scan, track, acq_date, acq_time,
  satellite, instrument, confidence, version, bright_t31, frp, daynight, type, version

Configuration (via environment):
  FIRMS_MAP_KEY          — NASA FIRMS API key (required; free at firms.modaps.eosdis.nasa.gov)
  FIRMS_SOURCE           — feed name (default: VIIRS_SNPP_NRT)
  FIRMS_FETCH_INTERVAL_M — poll interval in minutes (default: 10)
  FIRMS_DAYS_BACK        — days of history per request (default: 1)
  FIRMS_MIN_FRP          — minimum Fire Radiative Power filter in MW (default: 0.5)
    FIRMS_BBOX_MODE        — "mission" (default, area bbox) | "global" (world area endpoint)
  CENTER_LAT / CENTER_LON / COVERAGE_RADIUS_NM — mission area (shared with other pollers)
"""

import asyncio
import csv
import io
import json
import logging
import math
import os
import time
from datetime import UTC, datetime

import httpx
import psycopg2
from psycopg2.extras import execute_values

from sources.base import BaseSource

logger = logging.getLogger("space_pulse.firms")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

FIRMS_MAP_KEY          = os.getenv("FIRMS_MAP_KEY", "")
FIRMS_SOURCE           = os.getenv("FIRMS_SOURCE", "VIIRS_SNPP_NRT")
FIRMS_FETCH_INTERVAL_M = int(os.getenv("FIRMS_FETCH_INTERVAL_M", "10"))
FIRMS_DAYS_BACK        = int(os.getenv("FIRMS_DAYS_BACK", "1"))
FIRMS_MIN_FRP          = float(os.getenv("FIRMS_MIN_FRP", "0.5"))
# "mission" (default) — area query scoped to the mission bbox
# "global"           — NASA FIRMS world area endpoint, ingests all planetary detections
FIRMS_BBOX_MODE        = os.getenv("FIRMS_BBOX_MODE", "mission").lower()

CENTER_LAT         = float(os.getenv("CENTER_LAT", "45.5152"))
CENTER_LON         = float(os.getenv("CENTER_LON", "-122.6784"))
COVERAGE_RADIUS_NM = float(os.getenv("COVERAGE_RADIUS_NM", "150"))

# Add 25% padding to the bounding box so edge-of-area detections aren't clipped
BBOX_PADDING_FACTOR = 1.25

FIRMS_BASE_URL        = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
USER_AGENT     = "SovereignWatch/1.0 (SpacePulse FIRMS dark-vessel)"
HTTP_TIMEOUT   = 30.0

# VIIRS confidence values accepted as reliable
VIIRS_ACCEPTED_CONFIDENCE = {"nominal", "high"}

# Redis keys
REDIS_KEY_GEOJSON     = "firms:latest_geojson"
REDIS_KEY_DARK_VESSEL = "firms:dark_vessel_candidates"
REDIS_KEY_LAST_FETCH  = "firms_pulse:last_fetch"
REDIS_TTL_SECONDS     = 3600  # 1 hour


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _bbox_from_mission(lat: float, lon: float, radius_nm: float) -> tuple[float, float, float, float]:
    """Return (west, south, east, north) bounding box for a circular mission area."""
    radius_km  = radius_nm * 1.852 * BBOX_PADDING_FACTOR
    lat_deg    = radius_km / 111.0
    lon_deg    = radius_km / (111.0 * math.cos(math.radians(lat)))
    west  = max(-180.0, lon - lon_deg)
    east  = min(180.0,  lon + lon_deg)
    south = max(-90.0,  lat - lat_deg)
    north = min(90.0,   lat + lat_deg)
    return west, south, east, north


def _parse_viirs_confidence(raw: str) -> str | None:
    """Normalise VIIRS confidence string; return None to skip unrecognised rows.

    The FIRMS NRT API returns either the full word (nominal, high, low) or
    single-character abbreviations (n, h, l).  Both forms are accepted.
    """
    val = raw.strip().lower()
    # Full-word forms
    if val in VIIRS_ACCEPTED_CONFIDENCE:   # "nominal", "high"
        return val
    if val == "low":
        return "low"
    # Single-character abbreviations used by FIRMS NRT feed
    if val == "n":
        return "nominal"
    if val == "h":
        return "high"
    if val == "l":
        return "low"
    return None  # truly unexpected — skip


def _parse_modis_confidence(raw: str) -> str:
    """MODIS confidence is 0-100 integer; map to low/nominal/high string."""
    try:
        n = int(raw.strip())
    except ValueError:
        return "low"
    if n >= 80:
        return "high"
    if n >= 50:
        return "nominal"
    return "low"


def _rows_to_geojson(rows: list[dict]) -> dict:
    """Convert a list of hotspot dicts to a GeoJSON FeatureCollection."""
    features = []
    for r in rows:
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [r["longitude"], r["latitude"]],
            },
            "properties": {
                "brightness":  r.get("brightness"),
                "frp":         r.get("frp"),
                "confidence":  r.get("confidence"),
                "satellite":   r.get("satellite"),
                "instrument":  r.get("instrument"),
                "source":      r.get("source"),
                "daynight":    r.get("daynight"),
                "acq_date":    r.get("acq_date"),
                "acq_time":    r.get("acq_time"),
                "time":        r.get("time"),
            },
        })
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "fetched_at":  datetime.now(UTC).isoformat(),
            "source":      FIRMS_SOURCE,
            "count":       len(features),
        },
    }


def _store_hotspots_sync(db_url: str, rows: list[tuple]) -> int:
    """Persist FIRMS hotspots to TimescaleDB (synchronous — run via asyncio.to_thread)."""
    if not rows:
        return 0

    conn = psycopg2.connect(db_url)
    inserted = 0
    try:
        cur = conn.cursor()
        execute_values(
            cur,
            """
            INSERT INTO firms_hotspots
                (time, latitude, longitude, geom,
                 brightness, frp, confidence, satellite, instrument, source,
                 daynight, scan, track, acq_date, acq_time)
            VALUES %s
            ON CONFLICT ON CONSTRAINT ix_firms_hotspots_dedup DO NOTHING
            """,
            rows,
            template="""(
                %s, %s, %s,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s
            )""",
            page_size=500,
        )
        inserted = cur.rowcount if cur.rowcount >= 0 else len(rows)
        conn.commit()
        cur.close()
    finally:
        conn.close()

    return inserted


# ---------------------------------------------------------------------------
# FIRMSSource
# ---------------------------------------------------------------------------

class FIRMSSource(BaseSource):
    """
    Polls NASA FIRMS NRT API on a fixed interval and persists thermal hotspot
    detections to TimescaleDB.  Caches the latest GeoJSON in Redis for fast
    API reads.

    Integrated into SpacePulseService alongside OrbitalSource, SpaceWeatherSource, etc.
    """

    def __init__(self, client=None, redis_client=None, db_url: str = "", fetch_interval_m: int = FIRMS_FETCH_INTERVAL_M):
        super().__init__(client)
        self.redis_client    = redis_client
        self.db_url          = db_url
        self.fetch_interval  = fetch_interval_m * 60  # convert to seconds
        self._seen_keys: set[str] = set()  # (acq_date, acq_time, lat, lon, sat) dedup
        self._use_fallback   = False  # firms2.modaps.eosdis.nasa.gov fallback

    async def _get_last_fetch(self) -> float | None:
        if not self.redis_client:
            return None

        raw_value = await self.redis_client.get(REDIS_KEY_LAST_FETCH)
        if not raw_value:
            return None

        try:
            return float(raw_value)
        except (TypeError, ValueError):
            logger.warning("FIRMS: invalid last-fetch timestamp in Redis key %s", REDIS_KEY_LAST_FETCH)
            return None

    async def _set_last_fetch(self):
        if not self.redis_client:
            return

        await self.redis_client.set(
            REDIS_KEY_LAST_FETCH,
            str(time.time()),
            ex=int(self.fetch_interval * 2),
        )

    async def run(self):
        """Main polling loop — runs indefinitely inside SpacePulseService.run()."""
        if not FIRMS_MAP_KEY:
            logger.warning(
                "FIRMS_MAP_KEY not set — FIRMS source disabled. "
                "Register a free key at https://firms.modaps.eosdis.nasa.gov/api/area/"
            )
            return

        logger.info(
            "FIRMS source started (source=%s, interval=%dm, days_back=%d, min_frp=%.1f MW)",
            FIRMS_SOURCE, FIRMS_FETCH_INTERVAL_M, FIRMS_DAYS_BACK, FIRMS_MIN_FRP,
        )

        while True:
            try:
                now = time.time()
                last_fetch = await self._get_last_fetch()
                if last_fetch is not None:
                    elapsed = now - last_fetch
                    if elapsed < self.fetch_interval:
                        wait_sec = self.fetch_interval - elapsed
                        logger.info(
                            "FIRMS: cooldown active (%.1fm / %.1fm). Next in %.1fm.",
                            elapsed / 60,
                            self.fetch_interval / 60,
                            wait_sec / 60,
                        )
                        await asyncio.sleep(wait_sec)
                        continue
                else:
                    logger.info("FIRMS: no prior fetch timestamp — fetching immediately on startup.")

                await self._poll()
                await self._set_last_fetch()
            except Exception as exc:
                logger.exception("FIRMS poll error")
                if self.redis_client:
                    try:
                        await self.redis_client.set(
                            "poller:firms:last_error",
                            json.dumps({"ts": time.time(), "msg": str(exc)}),
                            ex=86400,
                        )
                    except Exception:
                        pass
                await asyncio.sleep(min(self.fetch_interval, 60))

    async def _poll(self):
        """Fetch and persist one round of FIRMS data."""
        domain = "firms2.modaps.eosdis.nasa.gov" if self._use_fallback else "firms.modaps.eosdis.nasa.gov"
        
        if FIRMS_BBOX_MODE == "global":
            endpoint = "area/csv"
            query_target = "world"
            logger.info("Polling FIRMS %s (mode=GLOBAL, days=%d)…", FIRMS_SOURCE, FIRMS_DAYS_BACK)
        else:
            west, south, east, north = _bbox_from_mission(CENTER_LAT, CENTER_LON, COVERAGE_RADIUS_NM)
            bbox_str = f"{west:.4f},{south:.4f},{east:.4f},{north:.4f}"
            endpoint = "area/csv"
            query_target = bbox_str
            logger.info("Polling FIRMS %s (mode=MISSION, bbox=%s, days=%d)…", FIRMS_SOURCE, bbox_str, FIRMS_DAYS_BACK)

        url = f"https://{domain}/api/{endpoint}/{FIRMS_MAP_KEY}/{FIRMS_SOURCE}/{query_target}/{FIRMS_DAYS_BACK}"

        try:
            resp = await self.fetch_with_retry(url, max_retries=2)
            
            # If primary fails, immediately try fallback on a different domain
            if not resp and not self._use_fallback:
                logger.warning("FIRMS Primary (%s) unreachable, attempting secondary...", domain)
                self._use_fallback = True
                domain = "firms2.modaps.eosdis.nasa.gov"
                url = f"https://{domain}/api/{endpoint}/{FIRMS_MAP_KEY}/{FIRMS_SOURCE}/{query_target}/{FIRMS_DAYS_BACK}"
                resp = await self.fetch_with_retry(url, max_retries=1)

            if not resp:
                return
                
            resp.raise_for_status()
            body = resp.text
            self._use_fallback = False  # Success, reset state for next poll
        except httpx.HTTPStatusError as exc:
            logger.error(
                "FIRMS HTTP error %d: %s",
                exc.response.status_code,
                repr(exc),
            )
            return
        except Exception as exc:
            logger.error("FIRMS fetch final failure: %s", repr(exc))
            return

        rows, hotspot_dicts = self._parse_csv(body)
        if not rows:
            logger.info("FIRMS: no new hotspots in area (or no detections this cycle)")
            # Do NOT overwrite Redis with an empty collection — the previous
            # cycle's data is still valid until its TTL expires.  Writing an
            # empty GeoJSON here poisons the API fast-path so it returns []
            # even when the DB still holds hotspots (e.g. manually injected
            # test data or rows from a prior poll that haven't aged out yet).
            return

        try:
            inserted = await asyncio.to_thread(_store_hotspots_sync, self.db_url, rows)
            logger.info("FIRMS: persisted %d new hotspots to TimescaleDB (%d total parsed)", inserted, len(rows))
        except Exception as exc:
            logger.error("FIRMS DB write failed: %s", exc)

        await self._update_redis_cache(hotspot_dicts)

    def _parse_csv(self, body: str) -> tuple[list[tuple], list[dict]]:
        """
        Parse FIRMS CSV body into DB row tuples and GeoJSON-ready dicts.

        Returns (db_rows, hotspot_dicts).
        db_rows are tuples for execute_values INSERT.
        hotspot_dicts are plain Python dicts for GeoJSON serialisation.
        """
        db_rows: list[tuple] = []
        hotspot_dicts: list[dict] = []

        is_viirs = "VIIRS" in FIRMS_SOURCE.upper()

        try:
            reader = csv.DictReader(io.StringIO(body))
        except Exception as exc:
            logger.error("FIRMS CSV parse error: %s", exc)
            return [], []

        for row in reader:
            try:
                lat = float(row.get("latitude", 0))
                lon = float(row.get("longitude", 0))
                if lat == 0.0 and lon == 0.0:
                    continue

                acq_date = row.get("acq_date", "").strip()
                acq_time = row.get("acq_time", "").strip().zfill(4)
                satellite = row.get("satellite", "").strip()

                # --- Deduplication ---
                dedup_key = f"{acq_date}|{acq_time}|{lat:.5f}|{lon:.5f}|{satellite}"
                if dedup_key in self._seen_keys:
                    continue
                self._seen_keys.add(dedup_key)
                # Bound the in-memory set to avoid unbounded growth
                if len(self._seen_keys) > 50_000:
                    self._seen_keys.clear()

                # --- Confidence ---
                raw_confidence = row.get("confidence", "").strip()
                if is_viirs:
                    confidence = _parse_viirs_confidence(raw_confidence)
                    if confidence is None:
                        continue  # skip truly unknown confidence values
                else:
                    confidence = _parse_modis_confidence(raw_confidence)

                # --- Brightness (instrument-specific field name) ---
                brightness_raw = row.get("bright_ti4") or row.get("brightness") or "0"
                try:
                    brightness = float(brightness_raw)
                except ValueError:
                    brightness = None

                # --- FRP ---
                frp_raw = row.get("frp", "0")
                try:
                    frp = float(frp_raw)
                except ValueError:
                    frp = 0.0

                # Filter out very weak detections (noise floor)
                if frp < FIRMS_MIN_FRP:
                    continue

                scan_raw = row.get("scan", "0")
                track_raw = row.get("track", "0")
                try:
                    scan  = float(scan_raw)
                    track = float(track_raw)
                except ValueError:
                    scan = track = None

                instrument = row.get("instrument", "").strip() or ("VIIRS" if is_viirs else "MODIS")
                daynight   = (row.get("daynight") or "U").strip().upper()[:1]

                # Build acquisition timestamp
                acq_dt: datetime | None = None
                if acq_date and acq_time:
                    try:
                        hour   = int(acq_time[:2])
                        minute = int(acq_time[2:])
                        acq_dt = datetime.strptime(acq_date, "%Y-%m-%d").replace(
                            hour=hour, minute=minute, tzinfo=UTC
                        )
                    except (ValueError, IndexError):
                        acq_dt = None

                time_val = acq_dt or datetime.now(UTC)
                acq_date_val = acq_dt.date() if acq_dt else None

                db_rows.append((
                    time_val, lat, lon,
                    lon, lat,               # ST_MakePoint(lon, lat) args
                    brightness, frp, confidence, satellite, instrument, FIRMS_SOURCE,
                    daynight, scan, track, acq_date_val, acq_time,
                ))

                hotspot_dicts.append({
                    "latitude":   lat,
                    "longitude":  lon,
                    "brightness": brightness,
                    "frp":        frp,
                    "confidence": confidence,
                    "satellite":  satellite,
                    "instrument": instrument,
                    "source":     FIRMS_SOURCE,
                    "daynight":   daynight,
                    "acq_date":   acq_date,
                    "acq_time":   acq_time,
                    "time":       time_val.isoformat(),
                })

            except Exception as exc:
                logger.debug("FIRMS row parse error: %s | row=%s", exc, row)
                continue

        return db_rows, hotspot_dicts

    async def _update_redis_cache(self, hotspot_dicts: list[dict]):
        """Write latest GeoJSON to Redis for fast API reads."""
        try:
            geojson = _rows_to_geojson(hotspot_dicts)
            await self.redis_client.setex(
                REDIS_KEY_GEOJSON,
                REDIS_TTL_SECONDS,
                json.dumps(geojson),
            )
            logger.debug("FIRMS: Redis cache updated (%d features)", len(hotspot_dicts))
        except Exception as exc:
            logger.warning("FIRMS Redis cache write failed: %s", exc)
