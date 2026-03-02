import json
import logging
import os
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from models.schemas import MissionLocation
from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.System")

@router.get("/health")
async def health():
    return {"status": "ok"}

@router.post("/api/config/location")
async def set_mission_location(location: MissionLocation):
    """
    Update the active surveillance area.
    Publishes to Redis pub/sub to notify all pollers.
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    # Validate constraints
    if location.radius_nm < 10 or location.radius_nm > 300:
        raise HTTPException(status_code=400, detail="Radius must be between 10 and 300 nautical miles")

    if not (-90 <= location.lat <= 90):
        raise HTTPException(status_code=400, detail="Invalid latitude")

    if not (-180 <= location.lon <= 180):
        raise HTTPException(status_code=400, detail="Invalid longitude")

    # Store in Redis
    mission_data = {
        "lat": location.lat,
        "lon": location.lon,
        "radius_nm": location.radius_nm,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    try:
        await db.redis_client.set("mission:active", json.dumps(mission_data))

        # Publish update to subscribers (pollers)
        await db.redis_client.publish("navigation-updates", json.dumps(mission_data))
    except Exception as e:
        logger.error(f"Mission location update failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    logger.info(f"Mission location updated: {location.lat}, {location.lon} ({location.radius_nm}nm)")

    return {"status": "ok", "active_mission": mission_data}

@router.get("/api/config/location")
async def get_mission_location():
    """
    Retrieve the current active surveillance area.
    If not set, returns Docker ENV defaults.
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        mission_json = await db.redis_client.get("mission:active")
    except Exception as e:
        logger.error(f"Failed to get mission location: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    if mission_json:
        return json.loads(mission_json)

    # Fallback to ENV defaults
    default_mission = {
        "lat": float(os.getenv("CENTER_LAT", "45.5152")),
        "lon": float(os.getenv("CENTER_LON", "-122.6784")),
        "radius_nm": int(os.getenv("COVERAGE_RADIUS_NM", "150")),
        "updated_at": None
    }

    return default_mission
