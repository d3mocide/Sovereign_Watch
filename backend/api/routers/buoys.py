"""
GET /api/buoys/latest — NDBC Ocean Buoy observations (Phase 1 Geospatial).

Two data paths:
  1. Redis fast-path: if ndbc:latest_obs exists (written by infra_poller every 15 min)
     and the request has no bbox, return the cached FeatureCollection directly.
  2. Database query: PostGIS bbox filter against the ndbc_obs hypertable, returning
     the single most-recent observation per buoy within the viewport bounds.

The database path is used when:
  - Redis cache is empty (poller not yet run / cache expired)
  - A bbox is provided (frontend requests viewport-scoped data)
"""

import json
import logging

from fastapi import APIRouter, HTTPException, Query

from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Buoys")


@router.get("/api/buoys/latest")
async def get_buoys_latest(
    min_lat: float = Query(default=-90.0, ge=-90.0, le=90.0),
    max_lat: float = Query(default=90.0, ge=-90.0, le=90.0),
    min_lon: float = Query(default=-180.0, ge=-180.0, le=180.0),
    max_lon: float = Query(default=180.0, ge=-180.0, le=180.0),
    limit:   int   = Query(default=2000, ge=1, le=5000),
):
    """Return the latest NDBC buoy observation per station within a bounding box.

    Uses the Redis cache when no tight bbox is specified (full-world view).
    Falls back to a live DB query when bbox restricts the viewport.
    """
    global_bbox = (
        min_lat <= -89.9
        and max_lat >= 89.9
        and min_lon <= -179.9
        and max_lon >= 179.9
    )

    # Fast-path: full-world view → serve Redis cache written by the poller
    if global_bbox and db.redis_client:
        try:
            cached = await db.redis_client.get("ndbc:latest_obs")
            if cached:
                return json.loads(cached)
        except Exception as exc:
            logger.warning("Redis cache read failed, falling back to DB: %s", exc)

    # Database query: latest observation per buoy within bbox
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    query = """
    SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
            json_build_object(
                'type',     'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', json_build_object(
                    'buoy_id',  buoy_id,
                    'wvht_m',   wvht_m,
                    'wtmp_c',   wtmp_c,
                    'wspd_ms',  wspd_ms,
                    'wdir_deg', wdir_deg,
                    'atmp_c',   atmp_c,
                    'pres_hpa', pres_hpa,
                    'time',     time
                )
            )
        ), '[]'::json)
    )
    FROM (
        SELECT DISTINCT ON (buoy_id)
            buoy_id, lat, lon, wvht_m, wtmp_c, wspd_ms, wdir_deg, atmp_c, pres_hpa, time, geom
        FROM ndbc_obs
        WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
          AND time > NOW() - INTERVAL '2 hours'
        ORDER BY buoy_id, time DESC
        LIMIT $5
    ) AS latest;
    """

    try:
        async with db.pool.acquire() as conn:
            result = await conn.fetchval(
                query, min_lon, min_lat, max_lon, max_lat, limit
            )
        if not result:
            return {"type": "FeatureCollection", "features": []}
        return json.loads(result)
    except Exception as exc:
        logger.error("Error fetching NDBC buoys: %s", exc)
        raise HTTPException(status_code=500, detail="Database error")
