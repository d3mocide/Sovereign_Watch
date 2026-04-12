"""
OpenAIP Airspace Zones API router.

Serves global restricted/danger/prohibited airspace polygons sourced from
the OpenAIP Core API (api.core.openaip.net) — free, global, no .gov required.

Endpoints:
  GET /api/airspace/zones          — active zone cache (Redis GeoJSON FeatureCollection)
  GET /api/airspace/history        — zones from last N hours (TimescaleDB)
  GET /api/airspace/types          — metadata: available zone types + counts
"""

import json
import logging
from typing import Optional

from core.database import db
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Airspace")

_REDIS_KEY = "airspace:zones"


@router.get("/api/airspace/zones")
async def get_airspace_zones():
    """
    Returns all cached global airspace zones as a GeoJSON FeatureCollection.

    Served from Redis — refreshed every 24 hours by the aviation_poller.

    Each feature is a Polygon or MultiPolygon with properties:
      zone_id, name, type, icao_class, country, upper_limit, lower_limit, color
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        data = await db.redis_client.get(_REDIS_KEY)
        if data:
            return json.loads(data)
        return {"type": "FeatureCollection", "features": []}
    except Exception as exc:
        logger.error("Failed to fetch airspace zones from Redis: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/airspace/history")
async def get_airspace_history(
    hours: Optional[int] = Query(default=168, ge=1, le=720),
    zone_type: Optional[str] = Query(
        default=None,
        description="Filter by zone type (RESTRICTED, DANGER, PROHIBITED, WARNING, TRA, TSA, ADIZ)",
    ),
    country: Optional[str] = Query(
        default=None, description="Filter by ISO 3166-1 alpha-2 country code (e.g. US, DE)"
    ),
):
    """
    Returns airspace zone records from the last ``hours`` hours as a GeoJSON
    FeatureCollection (for audit / historical review).

    Query params:
      hours     — lookback window 1–720 h (default 168 / 7 days)
      zone_type — optional type filter
      country   — optional country code filter
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    conditions = ["time >= NOW() - ($1 * INTERVAL '1 hour')"]
    params: list = [hours]

    if zone_type:
        params.append(zone_type.upper())
        conditions.append(f"type = ${len(params)}")
    if country:
        params.append(country.upper())
        conditions.append(f"country = ${len(params)}")

    where_clause = " AND ".join(conditions)
    query = f"""
    SELECT zone_id, name, type, icao_class, country,
           upper_limit, lower_limit, geometry_json, time
    FROM airspace_zones
    WHERE {where_clause}
    ORDER BY time DESC
    LIMIT 5000
    """

    try:
        async with db.pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        features = []
        for row in rows:
            try:
                geom = json.loads(row["geometry_json"])
            except (json.JSONDecodeError, TypeError):
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": geom,
                    "properties": {
                        "zone_id":    row["zone_id"],
                        "name":       row["name"],
                        "type":       row["type"],
                        "icao_class": row["icao_class"],
                        "country":    row["country"],
                        "upper_limit": row["upper_limit"],
                        "lower_limit": row["lower_limit"],
                        "time":       row["time"].isoformat() if row["time"] else None,
                    },
                }
            )

        return {"type": "FeatureCollection", "features": features}
    except Exception as exc:
        logger.error("Error fetching airspace history: %s", exc)
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/api/airspace/types")
async def get_airspace_types():
    """
    Returns a summary of available airspace zone types and their counts
    from the most recent cache ingestion.

    Useful for building filter UIs and understanding coverage.
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    query = """
    SELECT type, COUNT(*) AS count
    FROM airspace_zones
    WHERE time >= NOW() - INTERVAL '48 hours'
    GROUP BY type
    ORDER BY count DESC
    """

    try:
        async with db.pool.acquire() as conn:
            rows = await conn.fetch(query)

        return {
            "types": [{"type": row["type"], "count": row["count"]} for row in rows]
        }
    except Exception as exc:
        logger.error("Error fetching airspace types: %s", exc)
        raise HTTPException(status_code=500, detail="Database error")
