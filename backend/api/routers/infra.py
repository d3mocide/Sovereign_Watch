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

@router.get("/api/infra/towers")
async def get_infra_towers(lat: float, lon: float, radius_km: float = 50.0):
    """Returns FCC ASR towers within a radius (max 200km)."""
    if radius_km > 200.0:
        radius_km = 200.0

    cache_key = f"infra:towers:{round(lat, 2)}:{round(lon, 2)}:{int(radius_km)}"

    if db.redis_client:
        cached = await db.redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

    query = """
        SELECT
            reg_num,
            type,
            height_m,
            owner,
            ST_Y(geom::geometry) as lat,
            ST_X(geom::geometry) as lon
        FROM infra_towers
        WHERE ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3
        )
        LIMIT 5000;
    """

    try:
        rows = await db.fetch(query, lon, lat, radius_km * 1000)

        features = []
        for row in rows:
            features.append({
                "type": "Feature",
                "properties": {
                    "reg_num": row["reg_num"],
                    "type": row["type"],
                    "height_m": row["height_m"],
                    "owner": row["owner"]
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [row["lon"], row["lat"]]
                }
            })

        geojson = {"type": "FeatureCollection", "features": features}

        if db.redis_client:
            # Cache for 12 hours since tower data updates weekly
            await db.redis_client.setex(cache_key, 43200, json.dumps(geojson))

        return geojson

    except Exception as e:
        logger.error(f"Failed to fetch infra towers: {e}")
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

