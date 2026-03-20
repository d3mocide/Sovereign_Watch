import json
import logging
import os
import time as _time
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from models.schemas import MissionLocation, AIModelRequest, WatchlistAddRequest
from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.System")

import yaml

# ---------------------------------------------------------------------------
# AI model registry — read from models.yaml at project root (mounted in Docker).
# ---------------------------------------------------------------------------
MODELS_YAML_PATH = os.getenv("MODELS_YAML_PATH", "/app/models.yaml")

def load_ai_models():
    try:
        with open(MODELS_YAML_PATH, "r") as f:
            data = yaml.safe_load(f)
            
            if data and "models" in data:
                models = data["models"]
                # Resolve environment variables
                for model in models:
                    for key, val in model.items():
                        if isinstance(val, str) and val.startswith("os.environ/"):
                            env_var = val.split("/", 1)[1]
                            model[key] = os.getenv(env_var, val)
                return models
    except Exception as e:
        logger.error(f"Failed to load {MODELS_YAML_PATH}: {e}")
    # Fallback default
    return [
        {"id": "deep-reasoner", "label": "Claude 3.5 Sonnet", "provider": "Anthropic", "local": False},
        {"id": "public-flash",  "label": "Gemini 1.5 Flash",  "provider": "Google",    "local": False},
        {"id": "secure-core",   "label": "LLaMA3 (Ollama)",   "provider": "Local",     "local": True},
    ]

AVAILABLE_AI_MODELS = load_ai_models()
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

    # Reload dynamically per request so changes to YAML take effect without restart
    available_models = load_ai_models()

    return {
        "active_model": active or AI_MODEL_DEFAULT,
        "available_models": available_models,
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
    # Check RF sources
    rb_key = os.getenv("REPEATERBOOK_API_TOKEN")
    rb_status = "Active" if rb_key and rb_key != "your_token_here" else "Missing Key"

    rr_key = os.getenv("RADIOREF_APP_KEY")
    rr_user = os.getenv("RADIOREF_USERNAME")
    rr_pass = os.getenv("RADIOREF_PASSWORD")
    rr_status = "Active" if rr_key and rr_user and rr_pass and rr_key != "your_app_key_here" else "Missing Key"

    # Public RF (ARD/NOAA NWR) - Always active as they don't require keys
    rf_public_status = "Active"

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
        {"id": "repeaterbook", "name": "RepeaterBook", "status": rb_status},
        {"id": "radioref", "name": "RadioReference", "status": rr_status},
        {"id": "rf_public", "name": "Public RF Assets", "status": rf_public_status},
        {"id": "ai", "name": "AI Analysis", "status": ai_status},
    ]

@router.post("/api/config/ai")
async def set_ai_config(req: AIModelRequest):
    """Switch the active AI model used for track analysis."""
    available_models = load_ai_models()
    valid_ids = {m["id"] for m in available_models}

    if req.model_id not in valid_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model '{req.model_id}'. Valid options: {sorted(valid_ids)}"
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

_WATCHLIST_KEY = "opensky:watchlist"
_PERMANENT_SCORE = 32_503_680_000.0  # 01-Jan-3000 — same sentinel used by the poller


@router.get("/api/watchlist")
async def get_watchlist():
    """Return all active (non-expired) watchlist entries."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        raw = await db.redis_client.zrangebyscore(
            _WATCHLIST_KEY, _time.time(), "+inf", withscores=True
        )
    except Exception as e:
        logger.error(f"Failed to read watchlist: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    result = []
    for icao24, score in raw:
        permanent = score >= _PERMANENT_SCORE - 1
        result.append({
            "icao24": icao24,
            "permanent": permanent,
            "expires_at": None if permanent else datetime.fromtimestamp(score, timezone.utc).isoformat(),
        })
    return result


@router.post("/api/watchlist", status_code=201)
async def add_to_watchlist(req: WatchlistAddRequest):
    """Add or refresh an ICAO24 in the global watchlist."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    icao24 = req.icao24.lower().strip()
    if not icao24 or len(icao24) != 6 or not all(c in "0123456789abcdef" for c in icao24):
        raise HTTPException(status_code=400, detail="icao24 must be exactly 6 hex characters")

    score = _PERMANENT_SCORE if req.ttl_days is None else _time.time() + req.ttl_days * 86400

    try:
        await db.redis_client.zadd(_WATCHLIST_KEY, {icao24: score})
    except Exception as e:
        logger.error(f"Failed to add watchlist entry: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    logger.info("Watchlist: added %s (permanent=%s)", icao24, req.ttl_days is None)
    return {"status": "ok", "icao24": icao24, "permanent": req.ttl_days is None}


@router.delete("/api/watchlist/{icao24}")
async def remove_from_watchlist(icao24: str):
    """Remove an ICAO24 from the global watchlist."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    icao24 = icao24.lower().strip()

    try:
        removed = await db.redis_client.zrem(_WATCHLIST_KEY, icao24)
    except Exception as e:
        logger.error(f"Failed to remove watchlist entry: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    if not removed:
        raise HTTPException(status_code=404, detail=f"'{icao24}' not found in watchlist")

    logger.info("Watchlist: removed %s", icao24)
    return {"status": "ok", "icao24": icao24}


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
