"""
Jamming API router — serves GPS jamming event data from Redis and TimescaleDB.

Endpoints:
  GET /api/jamming/active    — currently active jamming zones (from Redis cache)
  GET /api/jamming/history   — jamming events in the last N hours (from TimescaleDB)
"""

import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Jamming")


@router.get("/api/jamming/active")
async def get_active_jamming():
    """
    Returns currently active GPS jamming zones as a GeoJSON FeatureCollection.

    Each feature is a Point (centroid of the H3 hex cell) with properties:
      h3_index, confidence (0-1), affected_count, avg_nic, avg_nacp,
      kp_at_event, assessment ('jamming'|'space_weather'|'mixed'|'equipment'), time
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        data = await db.redis_client.get("jamming:active_zones")
        if data:
            return json.loads(data)
        return {"type": "FeatureCollection", "features": []}
    except Exception as e:
        logger.error("Failed to fetch active jamming zones: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/jamming/history")
async def get_jamming_history(hours: Optional[int] = Query(default=24, ge=1, le=168)):
    """
    Returns jamming events from the last `hours` hours as a GeoJSON FeatureCollection.

    Query params:
      hours  — lookback window (1–168, default 24)
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    query = """
    SELECT
        time,
        h3_index,
        centroid_lat,
        centroid_lon,
        confidence,
        affected_count,
        avg_nic,
        avg_nacp,
        kp_at_event,
        active,
        assessment
    FROM jamming_events
    WHERE time >= NOW() - ($1 * INTERVAL '1 hour')
    ORDER BY time DESC
    LIMIT 500
    """

    try:
        async with db.pool.acquire() as conn:
            rows = await conn.fetch(query, hours)

        features = []
        for row in rows:
            lat = row["centroid_lat"]
            lon = row["centroid_lon"]
            if lat is None or lon is None:
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {
                        "time": row["time"].isoformat() if row["time"] else None,
                        "h3_index": row["h3_index"],
                        "confidence": row["confidence"],
                        "affected_count": row["affected_count"],
                        "avg_nic": row["avg_nic"],
                        "avg_nacp": row["avg_nacp"],
                        "kp_at_event": row["kp_at_event"],
                        "active": row["active"],
                        "assessment": row["assessment"],
                    },
                }
            )

        return {"type": "FeatureCollection", "features": features}
    except Exception as e:
        logger.error("Error fetching jamming history: %s", e)
        raise HTTPException(status_code=500, detail="Database error")
