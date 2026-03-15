import json
import logging
import os
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from models.schemas import MissionLocation, AIModelRequest
from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.System")

# ---------------------------------------------------------------------------
# AI model registry — mirrors litellm_config.yaml model_list.
# Update here if models are added/removed from the YAML.
# ---------------------------------------------------------------------------
AVAILABLE_AI_MODELS = [
    {"id": "deep-reasoner", "label": "Claude 3.5 Sonnet", "provider": "Anthropic", "local": False},
    {"id": "public-flash",  "label": "Gemini 1.5 Flash",  "provider": "Google",    "local": False},
    {"id": "secure-core",   "label": "LLaMA3 (Ollama)",   "provider": "Local",     "local": True},
]
_VALID_MODEL_IDS = {m["id"] for m in AVAILABLE_AI_MODELS}
AI_MODEL_REDIS_KEY = "config:ai:active_model"
AI_MODEL_DEFAULT = os.getenv("LITELLM_MODEL", "deep-reasoner")

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

@router.get("/api/config/ai")
async def get_ai_config():
    """Return available AI models and the currently active one."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        active = await db.redis_client.get(AI_MODEL_REDIS_KEY)
    except Exception as e:
        logger.error(f"Failed to get AI model config: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    return {
        "active_model": active or AI_MODEL_DEFAULT,
        "available_models": AVAILABLE_AI_MODELS,
    }

@router.get("/api/config/features")
async def get_features_config():
    """Return enabled functionality based on environment."""
    return {
        "repeaterbook_enabled": bool(os.getenv("REPEATERBOOK_API_TOKEN")),
        "radioref_enabled": bool(
            os.getenv("RADIOREF_APP_KEY") and
            os.getenv("RADIOREF_USERNAME") and
            os.getenv("RADIOREF_PASSWORD")
        )
    }

@router.get("/api/config/streams")
async def get_streams_config():
    """Return the health and configuration status of various data streams."""
    # Check Maritime (AISStream)
    ais_key = os.getenv("AISSTREAM_API_KEY")
    maritime_status = "Active" if ais_key and ais_key != "your_key_here" else "Missing Key"

    # Check Orbital (Always active, no key required currently for Celestrak/SpaceTrack basic)
    orbital_status = "Active"

    # Check Aviation (Always active, no key required for ADS-B Exchange public/local)
    aviation_status = "Active"

    # Check RF/Repeaters
    rb_key = os.getenv("REPEATERBOOK_API_TOKEN")
    rr_key = os.getenv("RADIOREF_APP_KEY")
    rr_user = os.getenv("RADIOREF_USERNAME")
    rr_pass = os.getenv("RADIOREF_PASSWORD")

    rf_status = "Disabled"
    if rb_key and rb_key != "your_token_here":
        rf_status = "Active"
    elif rr_key and rr_user and rr_pass and rr_key != "your_app_key_here":
        rf_status = "Active"

    # Check AI Analysis
    anthropic = os.getenv("ANTHROPIC_API_KEY")
    gemini = os.getenv("GEMINI_API_KEY")
    ai_status = "Disabled"
    if (anthropic and anthropic != "your_key_here") or (gemini and gemini != "your_key_here"):
        ai_status = "Active"

    return [
        {"id": "aviation", "name": "Aviation Tracking", "status": aviation_status},
        {"id": "maritime", "name": "Maritime AIS", "status": maritime_status},
        {"id": "orbital", "name": "Orbital Assets", "status": orbital_status},
        {"id": "rf", "name": "RF Infrastructure", "status": rf_status},
        {"id": "ai", "name": "AI Analysis", "status": ai_status},
    ]

@router.post("/api/config/ai")
async def set_ai_config(req: AIModelRequest):
    """Switch the active AI model used for track analysis."""
    if req.model_id not in _VALID_MODEL_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model '{req.model_id}'. Valid options: {sorted(_VALID_MODEL_IDS)}"
        )

    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        await db.redis_client.set(AI_MODEL_REDIS_KEY, req.model_id)
    except Exception as e:
        logger.error(f"Failed to set AI model config: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    logger.info(f"AI model switched to: {req.model_id}")
    return {"status": "ok", "active_model": req.model_id}

@router.get("/api/debug/h3_cells")
async def get_h3_cells():
    """Return the current set of H3 polling cells and their statuses."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        # Retrieve all items from the h3:cell_state Hash
        cell_states = await db.redis_client.hgetall("h3:cell_state")
        
        # Parse each state from JSON back into dictionaries
        parsed_cells = []
        for cell_id, state_json in cell_states.items():
            cell_data = json.loads(state_json)
            cell_data["cell"] = cell_id
            parsed_cells.append(cell_data)

        # Sort by cell_id to ensure consistent ordering
        parsed_cells.sort(key=lambda x: x["cell"])

        return parsed_cells

    except Exception as e:
        logger.error(f"Failed to get H3 cells: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
