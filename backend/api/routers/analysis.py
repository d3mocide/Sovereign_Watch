import logging
import os
import yaml
from fastapi import APIRouter, HTTPException, Path, Request
from sse_starlette.sse import EventSourceResponse
from litellm import acompletion
from models.schemas import AnalyzeRequest
from core.database import db
from routers.system import AI_MODEL_REDIS_KEY, AI_MODEL_DEFAULT

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Analysis")

# ---------------------------------------------------------------------------
# Model alias → LiteLLM model string mapping (loaded from litellm_config.yaml)
# Without this, acompletion("public-flash") fails — LiteLLM only understands
# provider-prefixed strings like "gemini/gemini-1.5-flash".
# ---------------------------------------------------------------------------
_LITELLM_CONFIG_PATH = os.getenv("LITELLM_CONFIG_PATH", "/app/litellm_config.yaml")

def _load_model_map() -> dict:
    try:
        with open(_LITELLM_CONFIG_PATH) as f:
            cfg = yaml.safe_load(f)
        return {
            m["model_name"]: m["litellm_params"]["model"]
            for m in cfg.get("model_list", [])
        }
    except Exception as e:
        logger.warning(f"Could not load LiteLLM config from {_LITELLM_CONFIG_PATH}: {e}")
        return {}

_MODEL_MAP = _load_model_map()

@router.post("/api/analyze/{uid}")
async def analyze_track(
    request: Request,
    req: AnalyzeRequest,
    uid: str = Path(..., max_length=100, description="Unique identifier for the track entity")
):
    """
    Fusion Analysis Endpoint:
    1. Fetch Track History (Hard Data)
    2. Generate AI Assessment (Cognition)
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

    # 0. Rate Limiting to prevent LLM API exhaustion/DoS
    if db.redis_client:
        client_ip = request.client.host if request.client else "unknown"
        rate_limit_key = f"rate_limit:analyze:{client_ip}"
        try:
            # Limit to 10 requests per minute per IP
            requests = await db.redis_client.incr(rate_limit_key)
            if requests == 1:
                await db.redis_client.expire(rate_limit_key, 60)
            if requests > 10:
                logger.warning(f"Rate limit exceeded for AI analysis from {client_ip}")
                raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Rate limiting failed: {e}")

    # 1. Fetch Track History Summary
    # We aggregate to reduce tokens: Start/End location, bounding box, avg speed/alt
    track_query = """
        SELECT
            min(time) as start_time,
            max(time) as last_seen,
            count(*) as points,
            avg(speed) as avg_speed,
            avg(alt) as avg_alt,
            ST_AsText(ST_Centroid(ST_Collect(geom))) as centroid
        FROM tracks
        WHERE entity_id = $1
        AND time > NOW() - INTERVAL '1 hour' * $2
    """
    try:
        track_summary = await db.pool.fetchrow(track_query, uid, req.lookback_hours)
    except Exception as e:
        logger.error(f"Analysis track query failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    if not track_summary or track_summary['points'] == 0:
        return {"error": "No track data found for this entity within lookback period"}

    # 2. Construct Prompt
    system_prompt = """
    You are a Senior Intelligence Analyst. You are viewing a map of a decentralized sensor network.
    Analyze the provided track telemetry and correlated intelligence reports.
    Identify anomalies (erratic flight, dark AIS, mismatches).
    Return a concise tactical summary.
    """

    user_content = f"""
    TARGET: {uid}
    TELEMETRY SUMMARY ({req.lookback_hours}h):
    - Points: {track_summary['points']}
    - Avg Speed: {track_summary['avg_speed'] or 0:.1f} m/s
    - Avg Alt: {track_summary['avg_alt'] or 0:.0f} m
    - Last Seen: {track_summary['last_seen']}

    ASSESSMENT:
    """

    # 3. Resolve active model — prefer Redis-stored user selection, fall back to ENV default
    active_model = AI_MODEL_DEFAULT
    if db.redis_client:
        try:
            stored = await db.redis_client.get(AI_MODEL_REDIS_KEY)
            if stored:
                active_model = stored
        except Exception as e:
            logger.warning(f"Could not read AI model from Redis, using default: {e}")

    # 4. Stream AI Response
    # NEW-003 (supersedes BUG-005): The prior asyncio.to_thread(completion, ...,
    # stream=True) fix only offloaded the initial HTTP handshake. The generator
    # returned immediately, but the chunk-by-chunk iteration ran synchronously
    # back in the event loop — recreating the blocking problem, one token at a
    # time. Switching to acompletion() + async for keeps the event loop fully
    # unblocked throughout the entire streaming response.
    #
    # Translate the stored model alias (e.g. "public-flash") to the LiteLLM
    # provider-prefixed string (e.g. "gemini/gemini-1.5-flash") that acompletion
    # actually understands. Falls back to the alias itself if not found so that
    # unknown models fail with a clear LiteLLM error rather than silently.
    litellm_model = _MODEL_MAP.get(active_model, active_model)
    logger.info(f"Running analysis for {uid} with model {active_model!r} -> {litellm_model!r}")

    async def event_generator():
        try:
            response = await acompletion(
                model=litellm_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                stream=True
            )
            async for chunk in response:
                content = chunk.choices[0].delta.content or ""
                if content:
                    yield {"data": content}
        except Exception as e:
            logger.error(f"AI analysis failed for {uid} (model={litellm_model!r}): {e}")
            yield {"event": "error", "data": str(e)}

    return EventSourceResponse(event_generator())
