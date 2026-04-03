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
                    "actor1": r["actor1"],
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


ACTORS_CACHE_KEY = "gdelt:actors:v1"
ACTORS_CACHE_TTL = 300  # 5 minutes


@router.get("/api/gdelt/actors")
async def get_gdelt_actors(
    limit: int = Query(default=25, le=100, description="Max actors to return"),
    hours: int = Query(default=24, le=72, description="Lookback window in hours"),
    refresh: bool = Query(default=False, description="Bypass cache"),
):
    """
    Returns the top actors (countries/organisations) by event count from recent GDELT data.
    Used to populate the Intel Globe conflict-zones and active-actors sidebars.
    Each row includes centroid lat/lon derived from the average of their events.
    """
    cache_key = f"{ACTORS_CACHE_KEY}:{hours}:{limit}"

    if not refresh and db.redis_client:
        try:
            cached = await db.redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Actors cache read failed: {e}")

    if not db.pool:
        return []

    try:
        async with db.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    actor1_country                          AS actor,
                    'COUNTRY'                              AS actor_type,
                    COUNT(*)                               AS event_count,
                    AVG(goldstein)                         AS avg_goldstein,
                    AVG(lat)                               AS centroid_lat,
                    AVG(lon)                               AS centroid_lon,
                    SUM(CASE WHEN quad_class = 3 THEN 1 ELSE 0 END) AS verbal_conflict,
                    SUM(CASE WHEN quad_class = 4 THEN 1 ELSE 0 END) AS material_conflict,
                    SUM(CASE WHEN quad_class = 1 THEN 1 ELSE 0 END) AS verbal_coop,
                    SUM(CASE WHEN quad_class = 2 THEN 1 ELSE 0 END) AS material_coop
                FROM gdelt_events
                WHERE time > NOW() - ($1 || ' hours')::INTERVAL
                  AND actor1_country IS NOT NULL
                  AND actor1_country <> ''
                  AND lat IS NOT NULL
                GROUP BY actor1_country
                ORDER BY event_count DESC
                LIMIT $2
                """,
                str(hours),
                limit,
            )

        result = []
        for r in rows:
            avg_g = float(r["avg_goldstein"] or 0.0)
            if avg_g <= -5.0:
                threat_level = "CRITICAL"
            elif avg_g <= -2.0:
                threat_level = "ELEVATED"
            elif avg_g < 0.0:
                threat_level = "MONITORING"
            else:
                threat_level = "STABLE"

            result.append(
                {
                    "actor": r["actor"],
                    "actor_type": r["actor_type"],
                    "event_count": int(r["event_count"]),
                    "avg_goldstein": round(avg_g, 2),
                    "threat_level": threat_level,
                    "centroid_lat": float(r["centroid_lat"] or 0.0),
                    "centroid_lon": float(r["centroid_lon"] or 0.0),
                    "verbal_conflict": int(r["verbal_conflict"] or 0),
                    "material_conflict": int(r["material_conflict"] or 0),
                    "verbal_coop": int(r["verbal_coop"] or 0),
                    "material_coop": int(r["material_coop"] or 0),
                }
            )

        if db.redis_client:
            try:
                await db.redis_client.setex(
                    cache_key, ACTORS_CACHE_TTL, json.dumps(result)
                )
            except Exception as e:
                logger.warning(f"Actors cache write failed: {e}")

        return result

    except Exception as e:
        logger.error(f"GDELT actors fetch error: {e}")
        return []
