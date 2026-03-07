import json
import logging
from fastapi import APIRouter, HTTPException, Path
from sse_starlette.sse import EventSourceResponse
from litellm import acompletion
from models.schemas import AnalyzeRequest
from core.database import db
from core.config import settings
from routers.system import AI_MODEL_REDIS_KEY, AI_MODEL_DEFAULT

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Analysis")

@router.post("/api/analyze/{uid}")
async def analyze_track(
    req: AnalyzeRequest,
    uid: str = Path(..., max_length=100, description="Unique identifier for the track entity")
):
    """
    Fusion Analysis Endpoint:
    1. Fetch Track History (Hard Data)
    2. Fetch Intel Reports (Soft Data)
    3. Generate AI Assessment (Cognition)
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

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

    # 2. Fetch Contextual Intel
    # Calling the SQL function we defined in init.sql
    # Note: In a real implementation, we need to generate an embedding for the "Query"
    # "What is suspicious about this track?" -> Vector
    # For now, we'll demonstrate the logic flow.
    # To fix logic: We need an embedding service. LiteLLM embedding() call.

    # Let's generate a query embedding using LiteLLM (Optional, or just mock for V1)
    # response = completion(model="text-embedding-3-small", input=["suspicious activity"])
    # query_vec = response['data'][0]['embedding']

    # For this MVP, we will skip the vector query *execution* in python if we don't have the embedding model
    # ready in the docker stack configs.
    # We will pass a textual summary of reports if we had them.
    intel_reports = [] # Mock for now

    # 3. Construct Prompt
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

    INTELLIGENCE CONTEXT:
    {json.dumps(intel_reports)}

    ASSESSMENT:
    """

    # 4. Resolve active model — prefer Redis-stored user selection, fall back to ENV default
    active_model = AI_MODEL_DEFAULT
    if db.redis_client:
        try:
            stored = await db.redis_client.get(AI_MODEL_REDIS_KEY)
            if stored:
                active_model = stored
        except Exception as e:
            logger.warning(f"Could not read AI model from Redis, using default: {e}")

    # 5. Stream AI Response
    # NEW-003 (supersedes BUG-005): The prior asyncio.to_thread(completion, ...,
    # stream=True) fix only offloaded the initial HTTP handshake. The generator
    # returned immediately, but the chunk-by-chunk iteration ran synchronously
    # back in the event loop — recreating the blocking problem, one token at a
    # time. Switching to acompletion() + async for keeps the event loop fully
    # unblocked throughout the entire streaming response.
    async def event_generator():
        response = await acompletion(
            model=active_model,
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

    return EventSourceResponse(event_generator())
