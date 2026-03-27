"""
Holding Pattern Detection API router — serves aircraft holding pattern data from Redis and TimescaleDB.

Endpoints:
  GET /api/holding-patterns/active    — currently active holding patterns (from Redis cache)
  GET /api/holding-patterns/history   — holding pattern events in the last N hours (from TimescaleDB)
  GET /api/aircraft/{hex_id}/holding-patterns — holding patterns for specific aircraft
"""

import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Path
from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.HoldingPatterns")


@router.get("/api/holding-patterns/active")
async def get_active_holding_patterns():
    """
    Returns currently active holding patterns as a GeoJSON FeatureCollection.

    Each feature is a Point (aircraft location) with properties:
      hex_id, callsign, altitude, speed, total_turn_degrees, turns_completed,
      pattern_duration_sec, confidence (0-1), h3_index, time
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        data = await db.redis_client.get("holding_pattern:active_zones")
        if data:
            return json.loads(data)
        return {"type": "FeatureCollection", "features": []}
    except Exception as e:
        logger.error("Failed to fetch active holding patterns: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/holding-patterns/history")
async def get_holding_patterns_history(hours: Optional[int] = Query(default=24, ge=1, le=168)):
    """
    Returns holding pattern events from the last `hours` hours as a GeoJSON FeatureCollection.

    Query params:
      hours  — lookback window (1–168, default 24)
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    query = """
    SELECT
        time,
        hex_id,
        callsign,
        centroid_lat,
        centroid_lon,
        altitude,
        speed,
        total_turn_degrees,
        turns_completed,
        pattern_duration_sec,
        confidence,
        h3_index
    FROM holding_pattern_events
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
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "time": row["time"].isoformat() if row["time"] else None,
                    "hex_id": row["hex_id"],
                    "callsign": row["callsign"],
                    "altitude": row["altitude"],
                    "speed": row["speed"],
                    "total_turn_degrees": row["total_turn_degrees"],
                    "turns_completed": row["turns_completed"],
                    "pattern_duration_sec": row["pattern_duration_sec"],
                    "confidence": row["confidence"],
                    "h3_index": row["h3_index"],
                },
            })

        return {"type": "FeatureCollection", "features": features}
    except Exception as e:
        logger.error("Error fetching holding pattern history: %s", e)
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/api/aircraft/{hex_id}/holding-patterns")
async def get_aircraft_holding_patterns(
    hex_id: str = Path(..., description="Aircraft hex ID (ICAO24)"),
    hours: Optional[int] = Query(default=24, ge=1, le=168)
):
    """
    Returns holding pattern history for a specific aircraft.

    Query params:
      hours  — lookback window (1–168, default 24)
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    query = """
    SELECT
        time,
        hex_id,
        callsign,
        centroid_lat,
        centroid_lon,
        altitude,
        speed,
        total_turn_degrees,
        turns_completed,
        pattern_duration_sec,
        confidence
    FROM holding_pattern_events
    WHERE hex_id = $1 AND time >= NOW() - ($2 * INTERVAL '1 hour')
    ORDER BY time DESC
    LIMIT 100
    """

    try:
        async with db.pool.acquire() as conn:
            rows = await conn.fetch(query, hex_id.lower(), hours)

        events = []
        for row in rows:
            events.append({
                "time": row["time"].isoformat() if row["time"] else None,
                "hex_id": row["hex_id"],
                "callsign": row["callsign"],
                "latitude": row["centroid_lat"],
                "longitude": row["centroid_lon"],
                "altitude": row["altitude"],
                "speed": row["speed"],
                "total_turn_degrees": row["total_turn_degrees"],
                "turns_completed": row["turns_completed"],
                "pattern_duration_sec": row["pattern_duration_sec"],
                "confidence": row["confidence"],
            })

        return {
            "hex_id": hex_id.lower(),
            "events": events,
            "total_events": len(events),
        }
    except Exception as e:
        logger.error("Error fetching holding patterns for aircraft %s: %s", hex_id, e)
        raise HTTPException(status_code=500, detail="Database error")
