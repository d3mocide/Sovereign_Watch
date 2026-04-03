import json
import logging
from fastapi import APIRouter, HTTPException
from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Infra")


@router.get("/api/infra/cables")
async def get_infra_cables():
    """Returns submarine cable data from Redis."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        data = await db.redis_client.get("infra:cables")
        if data:
            return json.loads(data)
        return {"type": "FeatureCollection", "features": []}
    except Exception as e:
        logger.error(f"Failed to fetch infra cables: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/infra/stations")
async def get_infra_stations():
    """Returns submarine landing stations data from Redis."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        data = await db.redis_client.get("infra:stations")
        if data:
            return json.loads(data)
        return {"type": "FeatureCollection", "features": []}
    except Exception as e:
        logger.error(f"Failed to fetch infra stations: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/infra/outages")
async def get_infra_outages():
    """Returns internet outages data from Redis."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        data = await db.redis_client.get("infra:outages")
        if data:
            return json.loads(data)
        return {"type": "FeatureCollection", "features": []}
    except Exception as e:
        logger.error(f"Failed to fetch infra outages: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/infra/nws-alerts")
async def get_nws_alerts():
    """Returns active NWS weather alerts GeoJSON from Redis."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        data = await db.redis_client.get("nws:alerts:active")
        if data:
            return json.loads(data)
        return {"type": "FeatureCollection", "features": []}
    except Exception as e:
        logger.error(f"Failed to fetch NWS alerts: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/infra/nws-alerts/summary")
async def get_nws_alerts_summary():
    """Returns summarized active NWS alert counts from Redis."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        data = await db.redis_client.get("nws:alerts:summary")
        if data:
            return json.loads(data)
        return {
            "count": 0,
            "severe_count": 0,
            "extreme_count": 0,
            "fetched_at": None,
        }
    except Exception as e:
        logger.error(f"Failed to fetch NWS alerts summary: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/infra/towers")
async def get_infra_towers(
    min_lat: float, min_lon: float, max_lat: float, max_lon: float, limit: int = 10000
):
    """Returns FCC Towers within a bounding box as GeoJSON."""
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    # Clamping bbox roughly around CONUS/Global
    min_lat = max(-90.0, min(90.0, min_lat))
    max_lat = max(-90.0, min(90.0, max_lat))
    min_lon = max(-180.0, min(180.0, min_lon))
    max_lon = max(-180.0, min(180.0, max_lon))

    query = """
    SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
            json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', json_build_object(
                    'id', id,
                    'fcc_id', fcc_id,
                    'type', type,
                    'owner', owner,
                    'status', status,
                    'height_m', height_m,
                    'elevation_m', elevation_m
                )
            )
        ), '[]'::json)
    )
    FROM (
        SELECT id, fcc_id, type, owner, status, height_m, elevation_m, geom
        FROM infra_towers
        WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        ORDER BY id
        LIMIT $5
    ) as sub;
    """

    try:
        async with db.pool.acquire() as conn:
            result = await conn.fetchval(
                query, min_lon, min_lat, max_lon, max_lat, limit
            )
            if not result:
                return {"type": "FeatureCollection", "features": []}
            return json.loads(result)
    except Exception as e:
        logger.error(f"Error fetching FCC towers: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/api/infrastructure/ixps")
async def get_ixps(
    min_lat: float = -90.0,
    min_lon: float = -180.0,
    max_lat: float = 90.0,
    max_lon: float = 180.0,
    limit: int = 2000,
):
    """Returns PeeringDB Internet Exchange Points within a bounding box as GeoJSON."""
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    min_lat = max(-90.0, min(90.0, min_lat))
    max_lat = max(-90.0, min(90.0, max_lat))
    min_lon = max(-180.0, min(180.0, min_lon))
    max_lon = max(-180.0, min(180.0, max_lon))

    query = """
    SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
            json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', json_build_object(
                    'ixp_id',   ixp_id,
                    'name',     name,
                    'name_long', name_long,
                    'city',     city,
                    'country',  country,
                    'website',  website,
                    'layer',    'ixp'
                )
            )
        ), '[]'::json)
    )
    FROM (
        SELECT ixp_id, name, name_long, city, country, website, geom
        FROM peeringdb_ixps
        WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        ORDER BY ixp_id
        LIMIT $5
    ) sub;
    """

    try:
        async with db.pool.acquire() as conn:
            result = await conn.fetchval(
                query, min_lon, min_lat, max_lon, max_lat, limit
            )
            if not result:
                return {"type": "FeatureCollection", "features": []}
            return json.loads(result)
    except Exception as e:
        logger.error(f"Error fetching IXPs: {e}")
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/api/infrastructure/facilities")
async def get_facilities(
    min_lat: float = -90.0,
    min_lon: float = -180.0,
    max_lat: float = 90.0,
    max_lon: float = 180.0,
    limit: int = 5000,
):
    """Returns PeeringDB data center facilities within a bounding box as GeoJSON."""
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    min_lat = max(-90.0, min(90.0, min_lat))
    max_lat = max(-90.0, min(90.0, max_lat))
    min_lon = max(-180.0, min(180.0, min_lon))
    max_lon = max(-180.0, min(180.0, max_lon))

    query = """
    SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
            json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', json_build_object(
                    'fac_id',   fac_id,
                    'name',     name,
                    'city',     city,
                    'country',  country,
                    'website',  website,
                    'org_name', org_name,
                    'layer',    'facility'
                )
            )
        ), '[]'::json)
    )
    FROM (
        SELECT fac_id, name, city, country, website, org_name, geom
        FROM peeringdb_facilities
        WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        ORDER BY fac_id
        LIMIT $5
    ) sub;
    """

    try:
        async with db.pool.acquire() as conn:
            result = await conn.fetchval(
                query, min_lon, min_lat, max_lon, max_lat, limit
            )
            if not result:
                return {"type": "FeatureCollection", "features": []}
            return json.loads(result)
    except Exception as e:
        logger.error(f"Error fetching facilities: {e}")
        raise HTTPException(status_code=500, detail="Database error")
