"""
NASA FIRMS + Dark Vessel Detection API.

Endpoints
---------
GET /api/firms/hotspots
    Returns VIIRS/MODIS thermal hotspot detections as GeoJSON.
    Serves from Redis cache (written by space_pulse/sources/firms.py) with a
    live DB fallback when the cache is empty or a bbox is requested.

GET /api/firms/dark-vessels
    Cross-references recent FIRMS hotspots against AIS vessel tracks to
    identify thermal detections with no matching AIS broadcast nearby.
    Results are cached in Redis for DARK_VESSEL_CACHE_TTL_S seconds to
    avoid repeated expensive PostGIS cross-joins.

Both endpoints return an empty FeatureCollection when no data is available
(poller has not yet run, or no detections are available in the requested window).
"""

import csv
import io
import json
import logging
import math
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

from core.database import db
from fastapi import APIRouter, HTTPException, Query
import httpx

router = APIRouter()
logger = logging.getLogger("SovereignWatch.FIRMS")

# Redis keys (must match space_pulse/sources/firms.py)
_REDIS_HOTSPOT_KEY    = "firms:latest_geojson"
_REDIS_DV_CACHE_KEY   = "firms:dark_vessel_candidates"

FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY", "").strip()
_DEFAULT_FIRMS_SOURCES = [
    "VIIRS_NOAA20_NRT",
    "VIIRS_NOAA21_NRT",
    "VIIRS_SNPP_NRT",
]


def _parse_firms_sources(raw_value: str | None) -> list[str]:
    if not raw_value:
        return _DEFAULT_FIRMS_SOURCES.copy()

    parsed: list[str] = []
    seen: set[str] = set()
    for value in raw_value.split(","):
        source = value.strip()
        if not source or source in seen:
            continue
        seen.add(source)
        parsed.append(source)

    return parsed or _DEFAULT_FIRMS_SOURCES.copy()


FIRMS_SOURCE = os.getenv("FIRMS_SOURCE", "")
FIRMS_SOURCES = _parse_firms_sources(FIRMS_SOURCE)
FIRMS_GLOBAL_CACHE_TTL_S = 600
_DEFAULT_LANDMASK_CONTAINER_PATH = Path("/app/support/world-countries.json")

# Dark vessel detection parameters (may be overridden via query params)
_DEFAULT_MATCH_RADIUS_NM  = 5.0    # AIS search radius around each hotspot
_DEFAULT_HOURS_BACK       = 24     # how far back to look in firms_hotspots
_DEFAULT_MIN_FRP          = 0.5    # minimum FRP (MW) to consider a vessel-scale detection
_DEFAULT_AIS_WINDOW_H     = 2.0    # ±hours around hotspot acquisition time to search AIS
DARK_VESSEL_CACHE_TTL_S   = 1800   # 30-minute cache on dark-vessel results

# Severity thresholds for dark vessel risk score
_DV_THRESHOLDS = [0.20, 0.45, 0.70]  # LOW / MEDIUM / HIGH / CRITICAL boundaries


def _nm_to_meters(nm: float) -> float:
    return nm * 1852.0


def _query_default(value):
    return getattr(value, "default", value)


def _risk_score(
    frp: float,
    nearest_ais_nm: float | None,
    match_radius_nm: float,
    daynight: str,
) -> float:
    """
    Composite dark vessel risk score in [0, 1].

    Components:
      FRP intensity  — higher FRP → more likely a vessel-scale heat source (0.0–0.40)
      AIS absence    — further from nearest AIS vessel → higher suspicion (0.0–0.50)
      Night bonus    — night-time VIIRS detection is more reliable than daytime (0.0–0.10)
    """
    # FRP component: logistic-like mapping capped at 40 MW (tanker engine range)
    frp_clamped = max(0.0, min(frp or 0.0, 40.0))
    frp_score   = 0.40 * (frp_clamped / 40.0)

    # AIS absence component
    if nearest_ais_nm is None:
        # No AIS at all within search area — maximum suspicion
        ais_score = 0.50
    else:
        # Partial suspicion: vessel is present but at distance
        ratio     = min(nearest_ais_nm / match_radius_nm, 1.0)
        ais_score = 0.50 * ratio

    # Night bonus
    night_bonus = 0.10 if (daynight or "").upper() == "N" else 0.0

    return round(min(frp_score + ais_score + night_bonus, 1.0), 4)


def _severity_label(score: float) -> str:
    lo, mid, hi = _DV_THRESHOLDS
    if score < lo:
        return "LOW"
    if score < mid:
        return "MEDIUM"
    if score < hi:
        return "HIGH"
    return "CRITICAL"


def _extract_land_geometry_geojson(feature_collection: dict) -> list[str]:
    geometries: list[str] = []
    for feature in feature_collection.get("features", []):
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict):
            continue
        if geometry.get("type") not in {"Polygon", "MultiPolygon"}:
            continue
        geometries.append(json.dumps(geometry, separators=(",", ":")))
    return geometries


def _candidate_landmask_paths() -> list[Path]:
    candidates: list[Path] = []

    env_path = os.getenv("FIRMS_LANDMASK_PATH", "").strip()
    if env_path:
        candidates.append(Path(env_path))

    candidates.append(_DEFAULT_LANDMASK_CONTAINER_PATH)

    module_path = Path(__file__).resolve()
    for parent in module_path.parents:
        # Check local support dir (standard layout)
        candidates.append(parent / "support" / "world-countries.json")
        # Check frontend public (alternative layout)
        candidates.append(parent / "frontend" / "public" / "world-countries.json")

    unique_candidates: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        candidate_key = str(candidate.resolve()) if candidate.exists() else str(candidate)
        if candidate_key in seen:
            continue
        seen.add(candidate_key)
        unique_candidates.append(candidate)
    return unique_candidates


def _load_world_land_geometry_geojson() -> list[str]:
    for path in _candidate_landmask_paths():
        if not path.exists():
            continue
        try:
            with path.open("r", encoding="utf-8") as handle:
                feature_collection = json.load(handle)
        except Exception as exc:
            logger.warning(
                "Failed to load world land polygons for FIRMS dark-vessel mask from %s: %s",
                path,
                exc,
            )
            continue

        if not isinstance(feature_collection, dict):
            continue

        geometries = _extract_land_geometry_geojson(feature_collection)
        if geometries:
            logger.info(
                "Loaded %d land geometries for FIRMS dark-vessel masking from: %s",
                len(geometries),
                path.resolve(),
            )
            return geometries

    logger.warning("No world land polygon asset found for FIRMS dark-vessel masking; land filter disabled")
    return []


_WORLD_LAND_GEOMETRIES = _load_world_land_geometry_geojson()


def _parse_viirs_confidence(raw: str) -> str | None:
    value = raw.strip().lower()
    if value in {"l", "low"}:
        return "low"
    if value in {"n", "nominal"}:
        return "nominal"
    if value in {"h", "high"}:
        return "high"

    try:
        numeric = int(value)
    except ValueError:
        return None

    if numeric >= 80:
        return "high"
    if numeric >= 30:
        return "nominal"
    if numeric >= 0:
        return "low"
    return None


def _parse_modis_confidence(raw: str) -> str:
    try:
        numeric = int(raw.strip())
    except ValueError:
        return "low"
    if numeric >= 80:
        return "high"
    if numeric >= 50:
        return "nominal"
    return "low"


def _rows_to_geojson(rows: list[dict], source: str, scope: str) -> dict:
    features = []
    for row in rows:
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [row["longitude"], row["latitude"]],
                },
                "properties": {
                    "brightness": row.get("brightness"),
                    "frp": row.get("frp"),
                    "confidence": row.get("confidence"),
                    "satellite": row.get("satellite"),
                    "instrument": row.get("instrument"),
                    "source": row.get("source"),
                    "daynight": row.get("daynight"),
                    "acq_date": row.get("acq_date"),
                    "acq_time": row.get("acq_time"),
                    "time": row.get("time"),
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "fetched_at": datetime.now(UTC).isoformat(),
            "source": source,
            "count": len(features),
            "scope": scope,
        },
    }


def _parse_firms_csv_to_rows(
    body: str,
    *,
    source: str,
    hours_back: int,
    min_frp: float,
    confidence: str,
    limit: int,
) -> list[dict]:
    rows: list[dict] = []
    seen_keys: set[str] = set()
    is_viirs = "VIIRS" in source.upper()
    now_utc = datetime.now(UTC)
    cutoff = now_utc - timedelta(hours=hours_back)

    try:
        reader = csv.DictReader(io.StringIO(body))
    except Exception as exc:
        logger.warning("FIRMS live CSV parse failed: %s", exc)
        return []

    for row in reader:
        try:
            lat = float(row.get("latitude", 0))
            lon = float(row.get("longitude", 0))
        except ValueError:
            continue

        if lat == 0.0 and lon == 0.0:
            continue

        acq_date = (row.get("acq_date") or "").strip()
        acq_time = (row.get("acq_time") or "").strip().zfill(4)
        satellite = (row.get("satellite") or "").strip()
        dedup_key = f"{acq_date}|{acq_time}|{lat:.5f}|{lon:.5f}|{satellite}"
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)

        raw_confidence = (row.get("confidence") or "").strip()
        normalized_confidence = (
            _parse_viirs_confidence(raw_confidence)
            if is_viirs
            else _parse_modis_confidence(raw_confidence)
        )
        if normalized_confidence is None:
            continue
        if confidence and normalized_confidence != confidence:
            continue

        brightness_raw = row.get("bright_ti4") or row.get("brightness") or "0"
        try:
            brightness = float(brightness_raw)
        except ValueError:
            brightness = None

        try:
            frp = float(row.get("frp", "0") or 0)
        except ValueError:
            frp = 0.0
        if frp < min_frp:
            continue

        instrument = (row.get("instrument") or "").strip() or ("VIIRS" if is_viirs else "MODIS")
        daynight = ((row.get("daynight") or "U").strip().upper() or "U")[:1]

        acq_dt: datetime | None = None
        if acq_date and acq_time:
            try:
                acq_dt = datetime.strptime(acq_date, "%Y-%m-%d").replace(
                    hour=int(acq_time[:2]),
                    minute=int(acq_time[2:]),
                    tzinfo=UTC,
                )
            except (ValueError, IndexError):
                acq_dt = None

        time_val = acq_dt or now_utc
        if time_val < cutoff:
            continue

        rows.append(
            {
                "latitude": lat,
                "longitude": lon,
                "brightness": brightness,
                "frp": frp,
                "confidence": normalized_confidence,
                "satellite": satellite or None,
                "instrument": instrument,
                "source": source,
                "daynight": daynight,
                "acq_date": acq_date or None,
                "acq_time": acq_time or None,
                "time": time_val.isoformat(),
            }
        )
        if len(rows) >= limit:
            break

    return rows


async def _fetch_live_global_hotspots(
    *,
    hours_back: int,
    min_frp: float,
    confidence: str,
    limit: int,
) -> dict | None:
    if not FIRMS_MAP_KEY:
        return None

    days_back = max(1, math.ceil(hours_back / 24))
    aggregated_rows: list[dict] = []

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            for source in FIRMS_SOURCES:
                url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{FIRMS_MAP_KEY}/{source}/world/{days_back}"
                try:
                    resp = await client.get(url)
                    resp.raise_for_status()
                except Exception as exc:
                    logger.warning("FIRMS live global fetch failed for %s: %s", source, exc)
                    continue

                rows = _parse_firms_csv_to_rows(
                    resp.text,
                    source=source,
                    hours_back=hours_back,
                    min_frp=min_frp,
                    confidence=confidence,
                    limit=max(limit - len(aggregated_rows), 0),
                )
                aggregated_rows.extend(rows)
                if len(aggregated_rows) >= limit:
                    break
    except Exception as exc:
        logger.warning("FIRMS live global fetch setup failed: %s", exc)
        return None

    return _rows_to_geojson(aggregated_rows, ",".join(FIRMS_SOURCES), "global_live")


# ---------------------------------------------------------------------------
# GET /api/firms/hotspots
# ---------------------------------------------------------------------------

@router.get("/api/firms/hotspots")
async def get_firms_hotspots(
    min_lat: float = Query(default=-90.0,  ge=-90.0,  le=90.0),
    max_lat: float = Query(default=90.0,   ge=-90.0,  le=90.0),
    min_lon: float = Query(default=-180.0, ge=-180.0, le=180.0),
    max_lon: float = Query(default=180.0,  ge=-180.0, le=180.0),
    hours_back: int  = Query(default=24, ge=1, le=72),
    min_frp:    float = Query(default=0.0, ge=0.0),
    confidence: str  = Query(default="", description="Filter: 'nominal', 'high', or '' for all"),
    limit: int       = Query(default=2000, ge=1, le=10000),
):
    """Return VIIRS/MODIS thermal hotspot detections as GeoJSON FeatureCollection."""
    global_bbox = (
        min_lat <= -89.9 and max_lat >= 89.9
        and min_lon <= -179.9 and max_lon >= 179.9
    )
    using_default_global_request = (
        global_bbox
        and hours_back == 24
        and min_frp == 0.0
        and not confidence
    )

    # The FIRMS ingest path is always global, so the primary hotspot cache is
    # already world-scoped. Prefer it for default global requests and fall back
    # to a live NASA world query when the cache is empty.
    if using_default_global_request and db.redis_client:
        try:
            cached = await db.redis_client.get(_REDIS_HOTSPOT_KEY)
            if cached:
                parsed = json.loads(cached)
                if parsed.get("features"):
                    return parsed
                logger.debug("FIRMS global cache is empty, falling back to live fetch / DB query")
        except Exception as exc:
            logger.warning("FIRMS Redis fast-path failed, falling back to live fetch / DB: %s", exc)

        live_result = await _fetch_live_global_hotspots(
            hours_back=hours_back,
            min_frp=min_frp,
            confidence=confidence,
            limit=limit,
        )
        if live_result and live_result.get("features"):
            try:
                await db.redis_client.setex(
                    _REDIS_HOTSPOT_KEY,
                    FIRMS_GLOBAL_CACHE_TTL_S,
                    json.dumps(live_result),
                )
            except Exception as exc:
                logger.warning("FIRMS global cache write failed: %s", exc)
            return live_result

    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    # Whitelist only — never interpolate user input into SQL
    _VALID_CONFIDENCE = {"nominal", "high", "low"}
    confidence_filter = ""
    if confidence in _VALID_CONFIDENCE:
        confidence_filter = "AND confidence = $8"
    # We'll pass confidence as an extra bind param only when filtering

    query = f"""
    SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
            json_build_object(
                'type',     'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', json_build_object(
                    'brightness', brightness,
                    'frp',        frp,
                    'confidence', confidence,
                    'satellite',  satellite,
                    'instrument', instrument,
                    'source',     source,
                    'daynight',   daynight,
                    'acq_date',   acq_date,
                    'acq_time',   acq_time,
                    'time',       time
                )
            )
        ), '[]'::json)
    )
    FROM (
        SELECT DISTINCT ON (latitude, longitude, acq_date, acq_time, satellite)
            geom, brightness, frp, confidence, satellite, instrument,
            source, daynight, acq_date, acq_time, time, latitude, longitude
        FROM firms_hotspots
        WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
          AND time > NOW() - ($5 || ' hours')::interval
          AND frp >= $6
          {confidence_filter}
        ORDER BY latitude, longitude, acq_date, acq_time, satellite, time DESC
        LIMIT $7
    ) AS latest;
    """

    try:
        async with db.pool.acquire() as conn:
            if confidence in {"nominal", "high", "low"}:
                result = await conn.fetchval(
                    query, min_lon, min_lat, max_lon, max_lat, str(hours_back), min_frp, limit, confidence
                )
            else:
                result = await conn.fetchval(
                    query, min_lon, min_lat, max_lon, max_lat, str(hours_back), min_frp, limit
                )
        if not result:
            return {"type": "FeatureCollection", "features": [], "metadata": {"count": 0}}
        return json.loads(result)
    except Exception as exc:
        logger.error("Error fetching FIRMS hotspots: %s", repr(exc))
        raise HTTPException(status_code=500, detail="Database error")


# ---------------------------------------------------------------------------
# GET /api/firms/dark-vessels
# ---------------------------------------------------------------------------

@router.get("/api/firms/dark-vessels")
async def get_dark_vessels(
    min_lat: float = Query(default=-90.0,  ge=-90.0,  le=90.0),
    max_lat: float = Query(default=90.0,   ge=-90.0,  le=90.0),
    min_lon: float = Query(default=-180.0, ge=-180.0, le=180.0),
    max_lon: float = Query(default=180.0,  ge=-180.0, le=180.0),
    hours_back:      int   = Query(default=_DEFAULT_HOURS_BACK,       ge=1,  le=72),
    match_radius_nm: float = Query(default=_DEFAULT_MATCH_RADIUS_NM,  ge=0.5, le=50.0),
    min_frp:         float = Query(default=_DEFAULT_MIN_FRP,          ge=0.0),
    ais_window_h:    float = Query(default=_DEFAULT_AIS_WINDOW_H,     ge=0.5, le=6.0),
    min_risk_score:  float = Query(default=0.0, ge=0.0, le=1.0),
):
    """
    Return dark vessel candidates: FIRMS hotspots with no matching AIS vessel
    within *match_radius_nm* nautical miles during the acquisition time window.

    Results are cached in Redis for 30 minutes.  Pass ?min_risk_score=0.4 to
    surface only MEDIUM or higher confidence candidates.
    """
    min_lat = _query_default(min_lat)
    max_lat = _query_default(max_lat)
    min_lon = _query_default(min_lon)
    max_lon = _query_default(max_lon)
    hours_back = _query_default(hours_back)
    match_radius_nm = _query_default(match_radius_nm)
    min_frp = _query_default(min_frp)
    ais_window_h = _query_default(ais_window_h)
    min_risk_score = _query_default(min_risk_score)

    global_bbox = (
        min_lat <= -89.9 and max_lat >= 89.9
        and min_lon <= -179.9 and max_lon >= 179.9
    )
    using_defaults = (
        hours_back      == _DEFAULT_HOURS_BACK
        and math.isclose(match_radius_nm, _DEFAULT_MATCH_RADIUS_NM)
        and math.isclose(min_frp,         _DEFAULT_MIN_FRP)
        and math.isclose(ais_window_h,    _DEFAULT_AIS_WINDOW_H)
        and min_risk_score == 0.0
    )

    # Redis cache hit — only for default parameters and global bbox
    if global_bbox and using_defaults and db.redis_client:
        try:
            cached = await db.redis_client.get(_REDIS_DV_CACHE_KEY)
            if cached:
                return json.loads(cached)
        except Exception as exc:
            logger.warning("Dark vessel Redis cache read failed: %s", exc)

    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    match_radius_m = _nm_to_meters(match_radius_nm)

    # Cross-reference FIRMS hotspots against AIS tracks.
    #
    # For each qualifying hotspot we find the nearest AIS-type track within
    # *match_radius_m* during the ±ais_window_h window.  Hotspots with no
    # nearby AIS track are dark vessel candidates.
    #
    # AIS CoT type prefix is 'a-f-S' (atom / friend / Sea).
    query = """
    WITH hotspots AS (
        SELECT
            f.time        AS hotspot_time,
            f.latitude,
            f.longitude,
            f.geom,
            f.brightness,
            f.frp,
            f.confidence,
            f.satellite,
            f.instrument,
            f.daynight
        FROM firms_hotspots f
        WHERE f.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
          AND f.time > NOW() - ($5 || ' hours')::interval
          AND f.frp >= $6
          AND f.confidence IN ('nominal', 'high')
    ),
    maritime_hotspots AS (
        SELECT h.*
        FROM hotspots h
        WHERE NOT EXISTS (
            SELECT 1
            FROM world_land_polygons lp
            WHERE ST_Intersects(lp.geom, h.geom)
        )
    ),
    nearest_ais AS (
        SELECT DISTINCT ON (h.latitude, h.longitude, h.hotspot_time)
            h.latitude,
            h.longitude,
            h.hotspot_time,
            t.entity_id  AS ais_mmsi,
            ST_Distance(h.geom::geography, t.geom::geography) / 1852.0 AS dist_nm
        FROM maritime_hotspots h
        LEFT JOIN tracks t ON (
            t.type LIKE 'a-f-S%%'
            AND t.time BETWEEN h.hotspot_time - ($7 || ' hours')::interval
                           AND h.hotspot_time + ($7 || ' hours')::interval
            AND ST_DWithin(h.geom::geography, t.geom::geography, $8)
        )
        ORDER BY h.latitude, h.longitude, h.hotspot_time, dist_nm ASC NULLS LAST
    )
    SELECT
        h.hotspot_time,
        h.latitude,
        h.longitude,
        h.brightness,
        h.frp,
        h.confidence,
        h.satellite,
        h.instrument,
        h.daynight,
        na.ais_mmsi,
        na.dist_nm AS nearest_ais_dist_nm
    FROM maritime_hotspots h
    LEFT JOIN nearest_ais na
        ON na.latitude = h.latitude
       AND na.longitude = h.longitude
       AND na.hotspot_time = h.hotspot_time
    WHERE na.ais_mmsi IS NULL   -- no AIS vessel found within radius
       OR na.dist_nm >= $9      -- AIS vessel present but at edge of match radius
    ORDER BY h.frp DESC
    LIMIT 500;
    """

    try:
        async with db.pool.acquire() as conn:
            rows = await conn.fetch(
                query,
                min_lon, min_lat, max_lon, max_lat,
                str(hours_back),
                min_frp,
                str(ais_window_h),
                match_radius_m,
                match_radius_nm * 0.8,   # inner threshold: vessels within 80% of radius aren't dark
            )
    except Exception as exc:
        logger.error("Dark vessel query failed: %s", repr(exc))
        raise HTTPException(status_code=500, detail="Database error")

    features = []
    for row in rows:
        frp       = row["frp"] or 0.0
        daynight  = row["daynight"] or "U"
        dist_nm   = row["nearest_ais_dist_nm"]

        score    = _risk_score(frp, dist_nm, match_radius_nm, daynight)
        severity = _severity_label(score)

        if score < min_risk_score:
            continue

        features.append({
            "type": "Feature",
            "geometry": {
                "type":        "Point",
                "coordinates": [row["longitude"], row["latitude"]],
            },
            "properties": {
                "hotspot_time":        row["hotspot_time"].isoformat() if row["hotspot_time"] else None,
                "brightness":          row["brightness"],
                "frp":                 frp,
                "confidence":          row["confidence"],
                "satellite":           row["satellite"],
                "instrument":          row["instrument"],
                "daynight":            daynight,
                "nearest_ais_mmsi":    row["ais_mmsi"],
                "nearest_ais_dist_nm": round(dist_nm, 2) if dist_nm is not None else None,
                "risk_score":          score,
                "risk_severity":       severity,
            },
        })

    result = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "count":           len(features),
            "match_radius_nm": match_radius_nm,
            "hours_back":      hours_back,
            "min_frp":         min_frp,
        },
    }

    # Cache default-parameter results in Redis
    if global_bbox and using_defaults and db.redis_client:
        try:
            await db.redis_client.setex(
                _REDIS_DV_CACHE_KEY,
                DARK_VESSEL_CACHE_TTL_S,
                json.dumps(result, default=str),
            )
        except Exception as exc:
            logger.warning("Dark vessel Redis cache write failed: %s", exc)

    return result
