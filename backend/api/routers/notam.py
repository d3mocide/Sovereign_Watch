"""
FAA NOTAM (Notice to Air Missions) API router.

Endpoints:
  GET /api/notam/active          — currently active NOTAMs (Redis GeoJSON cache)
  GET /api/notam/history         — NOTAM events from last N hours (TimescaleDB)
  GET /api/notam/{notam_id}      — detail for a single NOTAM by ID
"""

import json
import logging
from typing import Optional

from core.database import db
from fastapi import APIRouter, HTTPException, Path, Query

router = APIRouter()
logger = logging.getLogger("SovereignWatch.NOTAM")

_REDIS_KEY = "notam:active_zones"


@router.get("/api/notam/active")
async def get_active_notams():
    """
    Returns all currently active NOTAMs as a GeoJSON FeatureCollection.

    Served from Redis — refreshed every 10 minutes by the aviation_poller.

    Each feature is a Point with properties:
      notam_id, icao_id, feature_name, classification, keyword, category,
      effective_start, effective_end, radius_nm, min_alt_ft, max_alt_ft, raw_text
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        data = await db.redis_client.get(_REDIS_KEY)
        if data:
            return json.loads(data)
        return {"type": "FeatureCollection", "features": []}
    except Exception as exc:
        logger.error("Failed to fetch active NOTAMs from Redis: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/notam/history")
async def get_notam_history(
    hours: Optional[int] = Query(default=24, ge=1, le=168),
    keyword: Optional[str] = Query(default=None, description="Filter by FAA keyword (e.g. GPS, TFR, OBST)"),
    classification: Optional[str] = Query(default=None, description="Filter by classification (DOM, INTL, FDC, MIL)"),
):
    """
    Returns NOTAM events from the last ``hours`` hours as a GeoJSON FeatureCollection.

    Query params:
      hours          — lookback window 1–168 h (default 24)
      keyword        — optional FAA keyword filter (GPS, TFR, OBST, …)
      classification — optional classification filter (DOM, INTL, FDC, MIL, …)
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    conditions = ["time >= NOW() - ($1 * INTERVAL '1 hour')"]
    params: list = [hours]

    if keyword:
        params.append(keyword.upper())
        conditions.append(f"keyword = ${len(params)}")
    if classification:
        params.append(classification.upper())
        conditions.append(f"classification = ${len(params)}")

    where_clause = " AND ".join(conditions)
    query = f"""
    SELECT
        time, notam_id, icao_id, feature_name, classification, keyword,
        effective_start, effective_end, lat, lon, radius_nm,
        min_alt_ft, max_alt_ft, raw_text, geom_type
    FROM notam_events
    WHERE {where_clause}
    ORDER BY time DESC
    LIMIT 2000
    """

    try:
        async with db.pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        features = []
        for row in rows:
            lat = row["lat"]
            lon = row["lon"]
            if lat is None or lon is None:
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {
                        "time": row["time"].isoformat() if row["time"] else None,
                        "notam_id": row["notam_id"],
                        "icao_id": row["icao_id"],
                        "feature_name": row["feature_name"],
                        "classification": row["classification"],
                        "keyword": row["keyword"],
                        "effective_start": (
                            row["effective_start"].isoformat()
                            if row["effective_start"]
                            else None
                        ),
                        "effective_end": (
                            row["effective_end"].isoformat()
                            if row["effective_end"]
                            else None
                        ),
                        "radius_nm": row["radius_nm"],
                        "min_alt_ft": row["min_alt_ft"],
                        "max_alt_ft": row["max_alt_ft"],
                        "raw_text": row["raw_text"],
                        "geom_type": row["geom_type"],
                    },
                }
            )

        return {"type": "FeatureCollection", "features": features}
    except Exception as exc:
        logger.error("Error fetching NOTAM history: %s", exc)
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/api/notam/{notam_id:path}")
async def get_notam_detail(
    notam_id: str = Path(..., description="FAA NOTAM ID (e.g. '7/7894')"),
    hours: Optional[int] = Query(default=168, ge=1, le=720),
):
    """
    Returns the most recent record for a specific NOTAM ID.

    Query params:
      hours — lookback window (default 168 h / 7 days)
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    query = """
    SELECT
        time, notam_id, icao_id, feature_name, classification, keyword,
        effective_start, effective_end, lat, lon, radius_nm,
        min_alt_ft, max_alt_ft, raw_text, geom_type
    FROM notam_events
    WHERE notam_id = $1
      AND time >= NOW() - ($2 * INTERVAL '1 hour')
    ORDER BY time DESC
    LIMIT 1
    """

    try:
        async with db.pool.acquire() as conn:
            row = await conn.fetchrow(query, notam_id, hours)

        if not row:
            raise HTTPException(status_code=404, detail=f"NOTAM '{notam_id}' not found")

        return {
            "notam_id": row["notam_id"],
            "icao_id": row["icao_id"],
            "feature_name": row["feature_name"],
            "classification": row["classification"],
            "keyword": row["keyword"],
            "effective_start": (
                row["effective_start"].isoformat() if row["effective_start"] else None
            ),
            "effective_end": (
                row["effective_end"].isoformat() if row["effective_end"] else None
            ),
            "lat": row["lat"],
            "lon": row["lon"],
            "radius_nm": row["radius_nm"],
            "min_alt_ft": row["min_alt_ft"],
            "max_alt_ft": row["max_alt_ft"],
            "raw_text": row["raw_text"],
            "geom_type": row["geom_type"],
            "last_seen": row["time"].isoformat() if row["time"] else None,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error fetching NOTAM %s: %s", notam_id, exc)
        raise HTTPException(status_code=500, detail="Database error")
