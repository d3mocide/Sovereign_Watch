import json
import logging
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from litellm import completion
from models.schemas import AnalyzeRequest
from core.database import db
from core.config import settings

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Analysis")

@router.post("/api/analyze/{uid}")
async def analyze_track(uid: str, req: AnalyzeRequest):
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
    intel_query = """
        SELECT content, distance
        FROM get_contextual_intel(
            (SELECT embedding FROM intel_reports LIMIT 1), -- Placeholder: Real app needs query embedding generation
            50000, -- 50km
            ST_GeomFromText($1, 4326)
        )
    """
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
    - Avg Speed: {track_summary['avg_speed']:.1f} m/s
    - Avg Alt: {track_summary['avg_alt']:.0f} m
    - Last Seen: {track_summary['last_seen']}

    INTELLIGENCE CONTEXT:
    {json.dumps(intel_reports)}

    ASSESSMENT:
    """

    # 4. Stream AI Response
    async def event_generator():
        response = completion(
            model=settings.LITELLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            stream=True
        )
        for chunk in response:
            content = chunk.choices[0].delta.content or ""
            if content:
                yield {"data": content}

    return EventSourceResponse(event_generator())
