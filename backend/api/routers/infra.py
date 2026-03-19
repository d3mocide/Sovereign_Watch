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

