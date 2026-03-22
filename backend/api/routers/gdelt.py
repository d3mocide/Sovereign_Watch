import logging
import json
from fastapi import APIRouter, Query
from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.GDELT")

CACHE_KEY = "gdelt:events:geojson"
CACHE_TTL = 300  # 5 minutes for the API cache (poller runs every 15)

def _get_tone_color(goldstein: float) -> list[int]:
    """
    Returns an RGBA array based on the Goldstein scale (-10.0 to 10.0).
    Negative = Red/Orange (Conflict/Stress).
    Positive = Green (Stability).
    Neutral = White/Gray.
    """
    if goldstein <= -5.0:
        return [239, 68, 68, 255]   # red-500 (Conflict)
    if goldstein <= -2.0:
        return [249, 115, 22, 255]  # orange-500 (High Tension)
    if goldstein < 0.0:
        return [234, 179, 8, 200]   # yellow-500 (Moderate Tension)
    if goldstein >= 2.0:
        return [34, 197, 94, 255]   # green-500 (Stability)
    return [248, 250, 252, 220]     # slate-50 (Neutral)

@router.get("/api/gdelt/events")
async def get_gdelt_events(
    limit: int = Query(default=250, le=1000, description="Max records to return"),
    refresh: bool = Query(default=False, description="Bypass cache"),
):
    """
    Returns the latest geolocated OSINT events from the local GDELT hypertable.
    Mapped to GeoJSON for direct map rendering.
    """
    if not refresh and db.redis_client:
        try:
            cached = await db.redis_client.get(CACHE_KEY)
            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Cache read failed: {e}")

    if not db.pool:
        return {"type": "FeatureCollection", "features": []}

    try:
        async with db.pool.acquire() as conn:
            # Fetch latest geocoded events from the last 24 hours
            rows = await conn.fetch("""
                SELECT event_id, time, headline, url, goldstein, tone, lat, lon
                FROM gdelt_events
                WHERE time > NOW() - INTERVAL '24 hours'
                ORDER BY time DESC
                LIMIT $1
            """, limit)

        features = []
        for r in rows:
            feat = {
                "type": "Feature",
                "id": r["event_id"],
                "geometry": {
                    "type": "Point",
                    "coordinates": [r["lon"], r["lat"]]
                },
                "properties": {
                    "name": r["headline"],
                    "timestamp": r["time"].isoformat(),
                    "url": r["url"],
                    "goldstein": r["goldstein"],
                    "tone": r["tone"],
                    "toneColor": _get_tone_color(r["goldstein"] or 0.0) 
                }
            }
            features.append(feat)

        geojson = {"type": "FeatureCollection", "features": features}

        # Cache result
        if db.redis_client:
            try:
                await db.redis_client.setex(CACHE_KEY, CACHE_TTL, json.dumps(geojson))
            except Exception as e:
                logger.warning(f"Cache write failed: {e}")

        return geojson

    except Exception as e:
        logger.error(f"GDELT DB fetch error: {e}")
        return {"type": "FeatureCollection", "features": []}
