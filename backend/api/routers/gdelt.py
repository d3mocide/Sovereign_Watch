import json
import logging

import httpx
from fastapi import APIRouter, HTTPException, Query

from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.GDELT")

CACHE_KEY = "gdelt:events"
CACHE_TTL = 900  # 15 minutes — matches GDELT update cadence

# GDELT v2 GEO API — returns geolocated article events as GeoJSON
GDELT_GEO_URL = "https://api.gdeltproject.org/api/v2/geo/geo"

# Default query covers conflict, protest, disaster, and military events
DEFAULT_QUERY = (
    "conflict OR war OR protest OR explosion OR attack OR military OR "
    "sanctions OR missile OR airstrike OR earthquake OR flood OR disaster"
)


def _tone_to_color(tone: float) -> list[int]:
    """Map Goldstein tone score to RGBA.  Negative = conflict (red), Positive = cooperative (green)."""
    if tone <= -5:
        return [239, 68, 68, 220]    # red-500 — high conflict
    elif tone <= -2:
        return [249, 115, 22, 200]   # orange-500 — moderate conflict
    elif tone < 0:
        return [234, 179, 8, 180]    # yellow-500 — slight negative
    elif tone < 2:
        return [163, 230, 53, 180]   # lime-400 — neutral/slight positive
    else:
        return [34, 197, 94, 180]    # green-500 — cooperative


async def _fetch_gdelt_events(query: str, max_records: int) -> dict:
    """Fetch geolocated events from GDELT v2 GEO API and return as GeoJSON."""
    params = {
        "query": query,
        "mode": "PointData",
        "format": "GeoJSON",
        "timespan": "15min",
        "maxrecords": str(max_records),
        "SORTBY": "DATE",
    }
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        resp = await client.get(
            GDELT_GEO_URL,
            params=params,
            headers={"User-Agent": "SovereignWatch/1.0 (GDELTPulse)"},
        )
        resp.raise_for_status()
        data = resp.json()

    # Enrich each feature with a colour hint derived from tone
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        tone = props.get("tone", 0.0) or 0.0
        props["toneColor"] = _tone_to_color(float(tone))

    return data


@router.get("/api/gdelt/events")
async def get_gdelt_events(
    query: str = Query(default=DEFAULT_QUERY, description="GDELT GEO query string"),
    max_records: int = Query(default=250, le=1000, description="Maximum event records to return"),
    refresh: bool = Query(default=False, description="Force bypass of Redis cache"),
):
    """
    Returns geolocated GDELT news events as a GeoJSON FeatureCollection.

    Data is sourced from the GDELT v2 GEO API (https://gdeltproject.org/) and cached
    in Redis for 15 minutes to match the GDELT update cadence.  Each feature's
    properties include:
      - name:      Article headline
      - url:       Source article URL
      - domain:    Source domain
      - tone:      Goldstein tone score (negative = conflict, positive = cooperative)
      - toneColor: Pre-computed RGBA array for client-side rendering
      - dateadded: Publication timestamp (YYYYMMDDHHMMSS)
    """
    cache_key = f"{CACHE_KEY}:{hash(query)}:{max_records}"

    # Try Redis cache first
    if db.redis_client and not refresh:
        try:
            cached = await db.redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Redis cache read failed: {e}")

    # Fetch fresh data from GDELT
    try:
        data = await _fetch_gdelt_events(query, max_records)
    except httpx.HTTPStatusError as e:
        logger.error(f"GDELT API returned {e.response.status_code}: {e}")
        raise HTTPException(status_code=502, detail="GDELT API returned an error")
    except Exception as e:
        logger.error(f"Failed to fetch GDELT events: {e}")
        raise HTTPException(status_code=503, detail="Failed to reach GDELT API")

    # Store in Redis cache
    if db.redis_client:
        try:
            await db.redis_client.setex(cache_key, CACHE_TTL, json.dumps(data))
        except Exception as e:
            logger.warning(f"Redis cache write failed: {e}")

    return data
