import asyncio
import json
import logging
import os
import time as _time
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
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

    # Check RF sources
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
async def add_to_watchlist(req: WatchlistAddRequest, request: Request):
    """Add or refresh an ICAO24 in the global watchlist."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    # Rate Limiting
    if request.client and request.client.host:
        client_ip = request.client.host
        rl_key = f"rate_limit:watchlist:{client_ip}"
        try:
            req_count = await db.redis_client.incr(rl_key)
            if req_count == 1:
                await db.redis_client.expire(rl_key, 60)
            if req_count > 20:
                raise HTTPException(
                    status_code=429,
                    detail="Rate limit exceeded. Please try again later.",
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Rate limiting error: {e}")

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


@router.get("/api/config/poller-health")
async def get_poller_health():
    """Return real operational health for all data source pollers based on Redis state."""
    now = _time.time()

    # Credential checks
    ais_key = os.getenv("AISSTREAM_API_KEY", "")
    maritime_has_creds = bool(ais_key and ais_key != "your_key_here")

    rr_key  = os.getenv("RADIOREF_APP_KEY", "")
    rr_user = os.getenv("RADIOREF_USERNAME", "")
    rr_pass = os.getenv("RADIOREF_PASSWORD", "")
    radioref_has_creds = bool(
        rr_key and rr_user and rr_pass and rr_key != "your_app_key_here"
    )

    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    gemini_key    = os.getenv("GEMINI_API_KEY", "")
    ai_has_creds  = bool(
        (anthropic_key and anthropic_key != "your_key_here") or
        (gemini_key    and gemini_key    != "your_key_here")
    )

    # (id, name, group, fetch_key, error_key, stale_after_s, has_creds)
    # fetch_key="__space_weather__" = special: parse timestamp from kp_current JSON
    # fetch_key=None = no Redis tracking (env-var check only)
    POLLER_SPECS = [
        ("adsb",          "Aviation (ADS-B)",  "Tracking",       "adsb:last_fetch",                   "poller:adsb:last_error",            300,        True),
        ("maritime",      "Maritime AIS",       "Tracking",       "maritime:last_message_at",          "poller:maritime:last_error",        300,        maritime_has_creds),
        ("orbital",       "Orbital (TLE)",      "Orbital",        "orbital_pulse:last_fetch",          "poller:orbital:last_error",         7 * 3600,   True),
        ("satnogs_net",   "SatNOGS Network",    "Orbital",        "satnogs_pulse:network:last_fetch",  "poller:satnogs_network:last_error", 3 * 3600,   True),
        ("satnogs_db",    "SatNOGS Database",   "Orbital",        "satnogs_pulse:db:last_fetch",       "poller:satnogs_db:last_error",      30 * 3600,  True),
        ("space_weather", "Space Weather",      "Environment",    "__space_weather__",                 "poller:space_weather:last_error",   2 * 3600,   True),
        ("gdelt",         "GDELT Events",       "Intel",          "gdelt_pulse:last_fetch",            "poller:gdelt:last_error",           1800,       True),
        ("rf_ard",        "RF Amateur (ARD)",   "RF",             "rf_pulse:ard:last_fetch",           "poller:ard:last_error",             30 * 3600,  True),
        ("rf_noaa",       "NOAA NWR",           "RF",             "rf_pulse:noaa_nwr:last_fetch",      "poller:noaa_nwr:last_error",        8 * 86400,  True),
        ("radioref",      "RadioReference",     "RF",             "rf_pulse:radioref:last_fetch",      "poller:radioref:last_error",        8 * 86400,  radioref_has_creds),
        ("infra_cables",  "Undersea Cables",    "Infrastructure", "infra:last_cables_fetch",           "poller:infra_cables:last_error",    8 * 86400,  True),
        ("infra_towers",  "FCC Towers",         "Infrastructure", "infra:last_fcc_fetch",              "poller:infra_towers:last_error",    8 * 86400,  True),
        ("ai",            "AI Analysis",        "Analysis",       None,                                None,                                None,       ai_has_creds),
    ]

    # Fallback when Redis is unavailable
    if not db.redis_client:
        return [
            {
                "id": sid, "name": name, "group": group,
                "status": "no_credentials" if not has_creds else "unknown",
                "last_success": None, "last_error_ts": None,
                "last_error_msg": None, "stale_after_s": stale_s,
            }
            for sid, name, group, _, __, stale_s, has_creds in POLLER_SPECS
        ]

    # Collect all Redis keys we need
    keys_to_fetch = []
    for _, _, _, fetch_key, error_key, _, _ in POLLER_SPECS:
        if fetch_key and fetch_key != "__space_weather__":
            keys_to_fetch.append(fetch_key)
        if error_key:
            keys_to_fetch.append(error_key)
    keys_to_fetch.append("space_weather:kp_current")

    try:
        raw_values = await asyncio.gather(
            *[db.redis_client.get(k) for k in keys_to_fetch],
            return_exceptions=True,
        )
        kv = {
            k: (v if not isinstance(v, Exception) else None)
            for k, v in zip(keys_to_fetch, raw_values)
        }
    except Exception as e:
        logger.error("Redis error in poller-health: %s", e)
        kv = {}

    # Decode space-weather timestamp from cached JSON
    sw_last_success = None
    sw_json = kv.get("space_weather:kp_current")
    if sw_json:
        try:
            sw_ts_str = json.loads(sw_json).get("time")
            if sw_ts_str:
                sw_last_success = datetime.fromisoformat(
                    sw_ts_str.replace("Z", "+00:00")
                ).timestamp()
        except Exception:
            pass

    def _compute(fetch_key, error_key, stale_s, has_creds):
        if not has_creds:
            return "no_credentials", None, None, None

        # Resolve last_success timestamp
        if fetch_key == "__space_weather__":
            last_success = sw_last_success
        elif fetch_key:
            raw = kv.get(fetch_key)
            last_success = float(raw) if raw else None
        else:
            last_success = None  # env-var-only source

        # Resolve last_error
        last_error_ts = last_error_msg = None
        if error_key:
            err_raw = kv.get(error_key)
            if err_raw:
                try:
                    err = json.loads(err_raw)
                    last_error_ts  = err.get("ts")
                    last_error_msg = err.get("msg")
                except Exception:
                    pass

        # AI and other env-var-only sources: just report active
        if fetch_key is None and error_key is None:
            return "active", None, None, None

        # Compute status
        if last_success is None and last_error_ts is None:
            status = "pending"
        elif last_error_ts and (last_success is None or last_error_ts > last_success):
            status = "error"
        elif last_success is not None and stale_s is not None:
            status = "healthy" if (now - last_success) <= stale_s else "stale"
        else:
            status = "pending"

        return status, last_success, last_error_ts, last_error_msg

    results = []
    for sid, name, group, fetch_key, error_key, stale_s, has_creds in POLLER_SPECS:
        status, last_success, last_error_ts, last_error_msg = _compute(
            fetch_key, error_key, stale_s, has_creds
        )
        results.append({
            "id": sid,
            "name": name,
            "group": group,
            "status": status,
            "last_success": last_success,
            "last_error_ts": last_error_ts,
            "last_error_msg": last_error_msg,
            "stale_after_s": stale_s,
        })

    return results


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
