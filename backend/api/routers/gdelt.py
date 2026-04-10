import json
import logging
from urllib.parse import urlparse

from core.database import db
from fastapi import APIRouter, HTTPException, Query
from services.gdelt_linkage import (
    GDELT_LINKAGE_REASON,
    fetch_linked_gdelt_events,
    format_gdelt_linkage_notes,
)

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


def _resolve_mission_mode(
    *,
    h3_region: str | None,
    lat: float | None,
    lon: float | None,
    radius_nm: float | None,
) -> dict[str, object] | None:
    if not isinstance(h3_region, str):
        h3_region = getattr(h3_region, "default", None)
    if not isinstance(lat, (int, float)):
        lat = getattr(lat, "default", None)
    if not isinstance(lon, (int, float)):
        lon = getattr(lon, "default", None)
    if not isinstance(radius_nm, (int, float)):
        radius_nm = getattr(radius_nm, "default", None)

    has_radius_args = any(value is not None for value in (lat, lon, radius_nm))
    if h3_region and has_radius_args:
        raise HTTPException(status_code=400, detail="Provide either h3_region or lat/lon/radius_nm, not both")
    if has_radius_args and not all(value is not None for value in (lat, lon, radius_nm)):
        raise HTTPException(status_code=400, detail="lat, lon, and radius_nm are required together")
    if h3_region:
        return {"h3_region": h3_region}
    if has_radius_args:
        return {"lat": float(lat), "lon": float(lon), "radius_nm": float(radius_nm)}
    return None


@router.get("/api/gdelt/events")
async def get_gdelt_events(
    limit: int = Query(default=250, le=1000, description="Max records to return"),
    hours: int = Query(default=24, ge=1, le=168, description="Lookback window in hours"),
    h3_region: str | None = Query(default=None, description="Optional mission H3 cell for linked-only filtering"),
    lat: float | None = Query(default=None, description="Optional center latitude for radius mission filtering"),
    lon: float | None = Query(default=None, description="Optional center longitude for radius mission filtering"),
    radius_nm: float | None = Query(default=None, gt=0, description="Optional radius in nautical miles for mission filtering"),
    refresh: bool = Query(default=False, description="Bypass cache"),
):
    """
    Returns the latest geolocated OSINT events from the local GDELT hypertable.
    Mapped to GeoJSON for direct map rendering.
    """
    mission_mode = _resolve_mission_mode(h3_region=h3_region, lat=lat, lon=lon, radius_nm=radius_nm)

    if mission_mode is None and not refresh and db.redis_client:
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
            source_scope = None
            if mission_mode is not None:
                linkage_result = await fetch_linked_gdelt_events(
                    conn,
                    db.redis_client,
                    lookback_hours=hours,
                    **mission_mode,
                )
                rows = linkage_result.events[:limit]
                source_scope = {
                    "scope": (
                        "impact_linked_external"
                        if sum(linkage_result.linkage_counts.values()) > linkage_result.linkage_counts["in_aot"]
                        and linkage_result.linkage_counts["in_aot"] == 0
                        else "mission_area"
                    ),
                    "linkage_reason": GDELT_LINKAGE_REASON,
                    "lookback_hours": hours,
                    "notes": format_gdelt_linkage_notes(linkage_result.linkage_counts),
                }
            else:
                rows = [
                    dict(row)
                    for row in await conn.fetch(
                    """
                    SELECT event_id, time, headline, actor1, actor2, url, goldstein, tone, lat, lon,
                           actor1_country, actor2_country, event_code, event_root_code,
                           quad_class, num_mentions, num_sources, num_articles
                    FROM gdelt_events
                    WHERE time > NOW() - ($1 || ' hours')::INTERVAL
                    ORDER BY time DESC
                    LIMIT $2
                """,
                    str(hours),
                    limit,
                    )
                ]

        features = []
        for r in rows:
            feat = {
                "type": "Feature",
                "id": r.get("event_id") or r.get("event_id_cnty"),
                "geometry": {
                    "type": "Point",
                    "coordinates": [r.get("lon", r.get("event_longitude")), r.get("lat", r.get("event_latitude"))],
                },
                "properties": {
                    "event_id": r.get("event_id") or r.get("event_id_cnty"),
                    "name": r.get("headline") or r.get("event_text"),
                    "actor1": r.get("actor1"),
                    "actor2": r.get("actor2"),
                    "timestamp": (
                        r["time"].isoformat()
                        if r.get("time") is not None and hasattr(r["time"], "isoformat")
                        else r.get("event_date")
                    ),
                    "url": r.get("url"),
                    "domain": _extract_domain(r.get("url")),
                    "goldstein": r.get("goldstein"),
                    "tone": r.get("tone"),
                    "toneColor": _get_tone_color(r.get("goldstein") or 0.0),
                    "actor1_country": r.get("actor1_country"),
                    "actor2_country": r.get("actor2_country"),
                    "event_code": r.get("event_code"),
                    "event_root_code": r.get("event_root_code"),
                    "quad_class": r.get("quad_class"),
                    "num_mentions": r.get("num_mentions"),
                    "num_sources": r.get("num_sources"),
                    "num_articles": r.get("num_articles"),
                    "linkage_tier": r.get("linkage_tier"),
                    "linkage_chokepoint": r.get("linkage_chokepoint"),
                },
            }
            features.append(feat)

        geojson = {"type": "FeatureCollection", "features": features}
        if source_scope is not None:
            geojson["source_scope"] = source_scope

        # Cache result
        if db.redis_client and mission_mode is None:
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
    h3_region: str | None = Query(default=None, description="Optional mission H3 cell for linked-only filtering"),
    lat: float | None = Query(default=None, description="Optional center latitude for radius mission filtering"),
    lon: float | None = Query(default=None, description="Optional center longitude for radius mission filtering"),
    radius_nm: float | None = Query(default=None, gt=0, description="Optional radius in nautical miles for mission filtering"),
    refresh: bool = Query(default=False, description="Bypass cache"),
):
    """
    Returns the top actors (countries/organisations) by event count from recent GDELT data.
    Used to populate the Intel Globe conflict-zones and active-actors sidebars.
    Each row includes centroid lat/lon derived from the average of their events.
    """
    cache_key = f"{ACTORS_CACHE_KEY}:{hours}:{limit}"
    mission_mode = _resolve_mission_mode(h3_region=h3_region, lat=lat, lon=lon, radius_nm=radius_nm)

    if mission_mode is None and not refresh and db.redis_client:
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
            if mission_mode is not None:
                linkage_result = await fetch_linked_gdelt_events(
                    conn,
                    db.redis_client,
                    lookback_hours=hours,
                    **mission_mode,
                )
                actor_buckets: dict[str, dict] = {}
                for event in linkage_result.events:
                    actor = event.get("actor1_country")
                    lat = event.get("event_latitude")
                    lon = event.get("event_longitude")
                    if not actor or lat is None or lon is None:
                        continue
                    bucket = actor_buckets.setdefault(
                        str(actor),
                        {
                            "actor": str(actor),
                            "actor_type": "COUNTRY",
                            "event_count": 0,
                            "goldstein_total": 0.0,
                            "goldstein_count": 0,
                            "lat_total": 0.0,
                            "lon_total": 0.0,
                            "verbal_conflict": 0,
                            "material_conflict": 0,
                            "verbal_coop": 0,
                            "material_coop": 0,
                        },
                    )
                    bucket["event_count"] += 1
                    bucket["lat_total"] += float(lat)
                    bucket["lon_total"] += float(lon)
                    goldstein = event.get("goldstein")
                    if goldstein is not None:
                        bucket["goldstein_total"] += float(goldstein)
                        bucket["goldstein_count"] += 1
                    quad_class = event.get("quad_class")
                    if quad_class == 1:
                        bucket["verbal_coop"] += 1
                    elif quad_class == 2:
                        bucket["material_coop"] += 1
                    elif quad_class == 3:
                        bucket["verbal_conflict"] += 1
                    elif quad_class == 4:
                        bucket["material_conflict"] += 1

                rows = sorted(
                    actor_buckets.values(),
                    key=lambda row: (-row["event_count"], row["actor"]),
                )[:limit]
            else:
                rows = [
                    dict(row)
                    for row in await conn.fetch(
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
                ]

        result = []
        for r in rows:
            avg_g = float(r.get("avg_goldstein") or 0.0)
            if "goldstein_total" in r:
                avg_g = (
                    round(r["goldstein_total"] / r["goldstein_count"], 2)
                    if r["goldstein_count"]
                    else 0.0
                )
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
                    "actor": r.get("actor"),
                    "actor_type": r.get("actor_type"),
                    "event_count": int(r.get("event_count") or 0),
                    "avg_goldstein": round(avg_g, 2),
                    "threat_level": threat_level,
                    "centroid_lat": float(
                        (r["lat_total"] / r["event_count"]) if "lat_total" in r and r["event_count"] else r.get("centroid_lat") or 0.0
                    ),
                    "centroid_lon": float(
                        (r["lon_total"] / r["event_count"]) if "lon_total" in r and r["event_count"] else r.get("centroid_lon") or 0.0
                    ),
                    "verbal_conflict": int(r.get("verbal_conflict") or 0),
                    "material_conflict": int(r.get("material_conflict") or 0),
                    "verbal_coop": int(r.get("verbal_coop") or 0),
                    "material_coop": int(r.get("material_coop") or 0),
                }
            )

        if db.redis_client and mission_mode is None:
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
