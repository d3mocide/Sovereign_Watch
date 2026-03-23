import json
import logging
from urllib.parse import urlparse

from core.database import db
from fastapi import APIRouter, Query

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
        return [239, 68, 68, 255]  # red-500 (Conflict)
    if goldstein <= -2.0:
        return [249, 115, 22, 255]  # orange-500 (High Tension)
    if goldstein < 0.0:
        return [234, 179, 8, 200]  # yellow-500 (Moderate Tension)
    if goldstein >= 2.0:
        return [34, 197, 94, 255]  # green-500 (Stability)
    return [248, 250, 252, 220]  # slate-50 (Neutral)


def _extract_domain(url: str) -> str:
    """
    Extract domain/hostname from a URL string.
    Falls back to empty string if URL is malformed or None.
    """
    if not url or not isinstance(url, str):
        return ""
    try:
        parsed = urlparse(url.strip())
        # Accept only real web URLs for domain labels/source links.
        if parsed.scheme not in {"http", "https"}:
            return ""
        host = (parsed.netloc or "").lower().strip()
        # Ignore malformed numeric-only hosts that came from historical bad mapping.
        if not host or host.replace(".", "").replace("-", "").isdigit():
            return ""
        return host
    except Exception:
        return ""


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
            rows = await conn.fetch(
                """
                SELECT event_id, time, headline, actor1, actor2, url, goldstein, tone, lat, lon,
                       actor1_country, actor2_country, event_code, event_root_code,
                       quad_class, num_mentions, num_sources, num_articles
                FROM gdelt_events
                WHERE time > NOW() - INTERVAL '24 hours'
                ORDER BY time DESC
                LIMIT $1
            """,
                limit,
            )

        features = []
        for r in rows:
            feat = {
                "type": "Feature",
                "id": r["event_id"],
                "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
                "properties": {
                    "event_id": r["event_id"],
                    "name": r["headline"],
                    "actor2": r["actor2"],
                    "timestamp": r["time"].isoformat(),
                    "url": r["url"],
                    "domain": _extract_domain(r["url"]),
                    "goldstein": r["goldstein"],
                    "tone": r["tone"],
                    "toneColor": _get_tone_color(r["goldstein"] or 0.0),
                    "actor1_country": r["actor1_country"],
                    "actor2_country": r["actor2_country"],
                    "event_code": r["event_code"],
                    "event_root_code": r["event_root_code"],
                    "quad_class": r["quad_class"],
                    "num_mentions": r["num_mentions"],
                    "num_sources": r["num_sources"],
                    "num_articles": r["num_articles"],
                },
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
