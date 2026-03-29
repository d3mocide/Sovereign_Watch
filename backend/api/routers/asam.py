"""
GET /api/asam/incidents — ASAM Maritime Piracy Incidents (Phase 2 Geospatial).

Two data paths:
  1. Redis fast-path: if asam:latest exists (written by infra_poller on weekdays)
     and the request has no filtering constraints, return cached GeoJSON directly.
  2. Database query: PostGIS bbox filter against asam_incidents, with optional
     days-back window and minimum threat_score filter.
"""

import json
import logging

from fastapi import APIRouter, HTTPException, Query

from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.ASAM")


@router.get("/api/asam/incidents")
async def get_asam_incidents(
    min_lat:    float = Query(default=-90.0,  ge=-90.0,  le=90.0),
    max_lat:    float = Query(default=90.0,   ge=-90.0,  le=90.0),
    min_lon:    float = Query(default=-180.0, ge=-180.0, le=180.0),
    max_lon:    float = Query(default=180.0,  ge=-180.0, le=180.0),
    days:       int   = Query(default=365,    ge=1,      le=3650,
                              description="Look-back window in days"),
    threat_min: float = Query(default=0.0,    ge=0.0,    le=10.0,
                              description="Minimum threat_score to include"),
    limit:      int   = Query(default=2000,   ge=1,      le=10000),
):
    """Return ASAM piracy incidents within a bounding box.

    Uses the Redis cache when no tight bbox / filter is specified (full-world,
    default threat_min=0, days>=365).  Falls back to a live DB query otherwise.
    """
    global_bbox = (
        min_lat <= -89.9
        and max_lat >= 89.9
        and min_lon <= -179.9
        and max_lon >= 179.9
    )
    use_cache = global_bbox and threat_min <= 0.0 and days >= 365

    if use_cache and db.redis_client:
        try:
            cached = await db.redis_client.get("asam:latest")
            if cached:
                return json.loads(cached)
        except Exception as exc:
            logger.warning("Redis cache read failed, falling back to DB: %s", exc)

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
                    'reference',    reference,
                    'incident_date', incident_date,
                    'hostility',    hostility,
                    'victim',       victim,
                    'nav_area',     nav_area,
                    'subreg',       subreg,
                    'description',  description,
                    'threat_score', threat_score
                )
            ) ORDER BY threat_score DESC
        ), '[]'::json)
    )
    FROM asam_incidents
    WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      AND incident_date >= CURRENT_DATE - ($5 * INTERVAL '1 day')
      AND threat_score >= $6
    LIMIT $7
    """

    try:
        async with db.pool.acquire() as conn:
            result = await conn.fetchval(
                query, min_lon, min_lat, max_lon, max_lat,
                days, threat_min, limit
            )
        if not result:
            return {"type": "FeatureCollection", "features": []}
        return json.loads(result)
    except Exception as exc:
        logger.error("Error fetching ASAM incidents: %s", exc)
        raise HTTPException(status_code=500, detail="Database error")
