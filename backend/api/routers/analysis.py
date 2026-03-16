import logging
import math
from fastapi import APIRouter, HTTPException, Path, Request
from sse_starlette.sse import EventSourceResponse
from litellm import acompletion
from models.schemas import AnalyzeRequest
from core.database import db
from routers.system import AI_MODEL_REDIS_KEY, AI_MODEL_DEFAULT
from services.schema_context import get_schema_context

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Analysis")


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres between two WGS84 points."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


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
    # Aggregate to reduce tokens: summary stats + trajectory endpoints + entity type + meta snapshot
    track_query = """
        WITH ordered AS (
            SELECT
                time, lat, lon, alt, speed, heading, type, meta,
                ROW_NUMBER() OVER (ORDER BY time ASC)  AS rn_asc,
                ROW_NUMBER() OVER (ORDER BY time DESC) AS rn_desc,
                COUNT(*) OVER ()                        AS total_points
            FROM tracks
            WHERE entity_id = $1
              AND time > NOW() - INTERVAL '1 hour' * $2
        )
        SELECT
            MIN(time)                                       AS start_time,
            MAX(time)                                       AS last_seen,
            MAX(total_points)                               AS points,
            AVG(speed)                                      AS avg_speed,
            AVG(alt)                                        AS avg_alt,
            MAX(alt)                                        AS max_alt,
            MIN(alt)                                        AS min_alt,
            MAX(speed)                                      AS max_speed,
            ST_AsText(ST_Centroid(ST_Collect(
                CASE WHEN lat IS NOT NULL AND lon IS NOT NULL
                     THEN ST_MakePoint(lon, lat)::geometry END
            )))                                             AS centroid,
            MAX(CASE WHEN rn_asc  = 1 THEN lat  END)       AS start_lat,
            MAX(CASE WHEN rn_asc  = 1 THEN lon  END)       AS start_lon,
            MAX(CASE WHEN rn_desc = 1 THEN lat  END)       AS end_lat,
            MAX(CASE WHEN rn_desc = 1 THEN lon  END)       AS end_lon,
            MAX(CASE WHEN rn_desc = 1 THEN type END)       AS entity_type,
            MAX(CASE WHEN rn_desc = 1 THEN meta::text END) AS latest_meta,
            MAX(CASE WHEN rn_desc = 1 THEN heading END)    AS last_heading
        FROM ordered
    """
    try:
        track_summary = await db.pool.fetchrow(track_query, uid, req.lookback_hours)
    except Exception as e:
        logger.error(f"Analysis track query failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    if not track_summary or track_summary['points'] == 0:
        return {"error": "No track data found for this entity within lookback period"}

    # 2. Derive trajectory displacement
    displacement_km: float | None = None
    start_lat = track_summary['start_lat']
    start_lon = track_summary['start_lon']
    end_lat   = track_summary['end_lat']
    end_lon   = track_summary['end_lon']
    if all(v is not None for v in (start_lat, start_lon, end_lat, end_lon)):
        displacement_km = _haversine_km(start_lat, start_lon, end_lat, end_lon)

    entity_type: str = track_summary['entity_type'] or "unknown"

    # 3. Construct Prompt with schema-aware context
    schema_ctx = get_schema_context(entity_type if entity_type != "unknown" else None)

    system_prompt = f"""You are a Senior Intelligence Analyst on a distributed sensor network.
You receive structured telemetry from a multi-INT fusion platform and must produce a concise tactical assessment.

FIELD DEFINITIONS AND UNITS:
{schema_ctx}

ANALYTICAL GUIDANCE:
- Convert units in your reasoning (alt m→ft, speed m/s→knots) but report both where helpful
- Cross-reference meta fields against known anomaly indicators above
- For displacement near zero with high point count: suspect loitering or holding pattern
- For missing meta fields: note data gaps as they affect confidence
- Return a structured assessment: ENTITY TYPE | IDENTITY | BEHAVIOR | ANOMALY FLAGS | CONFIDENCE
"""

    # Build meta summary block
    latest_meta = track_summary['latest_meta'] or "{}"
    avg_speed_ms  = track_summary['avg_speed'] or 0.0
    avg_speed_kts = avg_speed_ms * 1.944
    max_speed_kts = (track_summary['max_speed'] or 0.0) * 1.944
    avg_alt_m     = track_summary['avg_alt'] or 0.0
    avg_alt_ft    = avg_alt_m * 3.281
    max_alt_ft    = (track_summary['max_alt'] or 0.0) * 3.281
    min_alt_ft    = (track_summary['min_alt'] or 0.0) * 3.281

    displacement_str = f"{displacement_km:.1f} km" if displacement_km is not None else "unknown"

    user_content = f"""TARGET: {uid}
ENTITY TYPE: {entity_type.upper()}
WINDOW: {req.lookback_hours}h | OBSERVATIONS: {track_summary['points']}
FIRST SEEN: {track_summary['start_time']} | LAST SEEN: {track_summary['last_seen']}

TELEMETRY:
  Speed (avg/max): {avg_speed_kts:.1f} kts / {max_speed_kts:.1f} kts  [{avg_speed_ms:.1f} m/s]
  Altitude (avg/max/min): {avg_alt_ft:.0f} ft / {max_alt_ft:.0f} ft / {min_alt_ft:.0f} ft  [{avg_alt_m:.0f} m avg]
  Last Heading: {track_summary['last_heading'] or 'N/A'}°
  Net Displacement: {displacement_str}

IDENTITY (latest meta): {latest_meta}

ASSESSMENT:"""

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
