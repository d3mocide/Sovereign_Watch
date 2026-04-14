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
(poller has not yet run, or no detections in the mission area).
"""

import json
import logging
import math

from core.database import db
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
logger = logging.getLogger("SovereignWatch.FIRMS")

# Redis keys (must match space_pulse/sources/firms.py)
_REDIS_HOTSPOT_KEY    = "firms:latest_geojson"
_REDIS_DV_CACHE_KEY   = "firms:dark_vessel_candidates"

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

    # Fast-path: global view with no extra filters → serve Redis cache.
    # Only serve cache when it actually contains features; an empty cached
    # collection can occur when the poller ran but found nothing, which would
    # mask DB rows inserted by other means (e.g. test injection, manual inserts).
    if global_bbox and hours_back == 24 and min_frp == 0.0 and not confidence and db.redis_client:
        try:
            cached = await db.redis_client.get(_REDIS_HOTSPOT_KEY)
            if cached:
                parsed = json.loads(cached)
                if parsed.get("features"):
                    return parsed
                # Cache is empty — fall through to DB so live data is returned
                logger.debug("FIRMS Redis cache is empty, falling back to DB query")
        except Exception as exc:
            logger.warning("FIRMS Redis fast-path failed, falling back to DB: %s", exc)

    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    confidence_filter = ""
    if confidence in ("nominal", "high"):
        confidence_filter = f"AND confidence = '{confidence}'"
    elif confidence == "low":
        confidence_filter = "AND confidence = 'low'"

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
            result = await conn.fetchval(
                query, min_lon, min_lat, max_lon, max_lat, str(hours_back), min_frp, limit
            )
        if not result:
            return {"type": "FeatureCollection", "features": [], "metadata": {"count": 0}}
        return json.loads(result)
    except Exception as exc:
        logger.error("Error fetching FIRMS hotspots: %s", exc)
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
    nearest_ais AS (
        SELECT DISTINCT ON (h.latitude, h.longitude, h.hotspot_time)
            h.latitude,
            h.longitude,
            h.hotspot_time,
            t.entity_id  AS ais_mmsi,
            ST_Distance(h.geom::geography, t.geom::geography) / 1852.0 AS dist_nm
        FROM hotspots h
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
    FROM hotspots h
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
        logger.error("Dark vessel query failed: %s", exc)
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
