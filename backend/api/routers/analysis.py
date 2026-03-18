import logging
import os
import yaml
from fastapi import APIRouter, HTTPException, Path, Request
from sse_starlette.sse import EventSourceResponse
from litellm import acompletion
from models.schemas import AnalyzeRequest
from core.database import db
from routers.system import AI_MODEL_REDIS_KEY, AI_MODEL_DEFAULT
from datetime import datetime, timezone, timedelta
import numpy as np
from sgp4.api import Satrec, jday
from utils.sgp4_utils import teme_to_ecef, ecef_to_lla_vectorized

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
        
        model_map = {}
        for m in cfg.get("model_list", []):
            name = m["model_name"]
            params = m.get("litellm_params", {}).copy()
            
            # Resolve environment variables for all parameters
            for key, val in params.items():
                if isinstance(val, str) and val.startswith("os.environ/"):
                    env_var = val.split("/", 1)[1]
                    params[key] = os.getenv(env_var, val)
                
            model_map[name] = params
            
        return model_map
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

    # 1. Fetch Track History Summary & Metadata
    track_query = """
        WITH summary AS (
            SELECT
                min(time) as start_time,
                max(time) as last_seen,
                count(*) as points,
                avg(speed) as avg_speed,
                min(speed) as min_speed,
                max(speed) as max_speed,
                avg(alt) as avg_alt,
                min(alt) as min_alt,
                max(alt) as max_alt,
                ST_Centroid(ST_Collect(geom)) as centroid_geom
            FROM tracks
            WHERE entity_id = $1
            AND time > NOW() - INTERVAL '1 hour' * $2
        ),
        metadata AS (
            SELECT type, meta
            FROM tracks
            WHERE entity_id = $1
            ORDER BY time DESC
            LIMIT 1
        )
        SELECT s.*, m.type, m.meta
        FROM summary s, metadata m
    """
    try:
        track_summary = await db.pool.fetchrow(track_query, uid, req.lookback_hours)
    except Exception as e:
        logger.error(f"Analysis track query failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    # 1.1 SATELLITE FALLBACK: If no hard tracks exist, but it's a known satellite, synthesize a track using SGP4
    if (not track_summary or track_summary['points'] == 0) and uid.startswith("SAT-"):
        norad_id = uid.replace("SAT-", "")
        async with db.pool.acquire() as conn:
            sat_row = await conn.fetchrow(
                "SELECT name, category, constellation, tle_line1, tle_line2 FROM satellites WHERE norad_id = $1",
                norad_id
            )
        
        if sat_row and sat_row['tle_line1'] and sat_row['tle_line2']:
            try:
                satrec = Satrec.twoline2rv(sat_row['tle_line1'], sat_row['tle_line2'])
                now = datetime.now(timezone.utc)
                
                # Synthesize 10 points over the lookback period
                points = []
                for i in range(10):
                    t = now - timedelta(hours=req.lookback_hours * (i / 10))
                    jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute, t.second + t.microsecond / 1e6)
                    e, r, v = satrec.sgp4(jd, fr)
                    if e == 0:
                        r_ecef = teme_to_ecef(np.array(r), jd, fr)
                        lat, lon, alt = ecef_to_lla_vectorized(r_ecef.reshape(1, 3))
                        speed = np.linalg.norm(np.array(v)) * 1000 # km/s to m/s
                        points.append({
                            "lat": lat[0], "lon": lon[0], "alt": alt[0] * 1000, "speed": speed, "time": t
                        })
                
                if points:
                    speeds = [p['speed'] for p in points]
                    alts = [p['alt'] for p in points]
                    
                    # Construct a virtual track summary
                    # Note: meta is formatted to match tracks table JSONB structure
                    track_summary = {
                        'start_time': points[-1]['time'],
                        'last_seen': points[0]['time'],
                        'points': len(points),
                        'avg_speed': sum(speeds) / len(speeds),
                        'min_speed': min(speeds),
                        'max_speed': max(speeds),
                        'avg_alt': sum(alts) / len(alts),
                        'min_alt': min(alts),
                        'max_alt': max(alts),
                        'centroid_geom': f"SRID=4326;POINT({points[0]['lon']} {points[0]['lat']})",
                        'type': 'a-s-K',
                        'meta': {
                            'callsign': sat_row['name'],
                            'classification': {
                                'category': sat_row['category'],
                                'constellation': sat_row['constellation']
                            }
                        }
                    }
                    logger.info(f"Synthesized virtual track for satellite {uid} ({len(points)} points)")
            except Exception as e:
                logger.warning(f"Failed to synthesize satellite track for {uid}: {e}")

    if not track_summary or track_summary['points'] == 0:
        # Instead of returning a naked dict (which fails as EventSourceResponse expects an iterable), 
        # yield an error event in the stream
        async def error_generator():
            yield {"event": "error", "data": "No track data found for this entity within lookback period"}
        return EventSourceResponse(error_generator())

    # 1.5 Fetch Nearby Intel Reports (Fusion)
    intel_context = ""
    if track_summary['centroid_geom']:
        intel_query = """
            SELECT content, timestamp
            FROM intel_reports
            WHERE ST_DWithin(geom::geography, $1::geography, 50000) -- 50km radius
            ORDER BY timestamp DESC
            LIMIT 3
        """
        try:
            intel_rows = await db.pool.fetch(intel_query, track_summary['centroid_geom'])
            if intel_rows:
                intel_context = "\nCORRELATED INTEL REPORTS (50km Radius):\n"
                for r in intel_rows:
                    intel_context += f"- [{r['timestamp'].strftime('%Y-%m-%d %H:%M')}] {r['content']}\n"
        except Exception as e:
            logger.warning(f"Failed to fetch intel for analysis: {e}")

    # 2. Construct Prompt based on Mode
    # Helper to decode CoT type (deterministic parse in Python)
    cot_type = track_summary.get('type', 'u-u-U')
    parts = cot_type.split('-')
    
    # Affiliation (2nd part) and Domain (3rd part) mapping
    affiliation_map = {'f': 'FRIENDLY', 'h': 'HOSTILE', 's': 'SUSPECT', 'n': 'NEUTRAL', 'u': 'UNKNOWN'}
    domain_map = {'A': 'AIR', 'S': 'SURFACE / MARITIME', 'G': 'GROUND', 's': 'SPACE / ORBITAL', 'p': 'INFRASTRUCTURE', 'K': 'SPACE / ORBITAL'}
    
    affil_char = parts[1] if len(parts) > 1 else 'u'
    domain_char = parts[2] if len(parts) > 2 else 'u'
    
    resolved_affil = affiliation_map.get(affil_char, 'UNKNOWN')
    resolved_domain = domain_map.get(domain_char, 'UNKNOWN')

    # TAK/CoT Reference for LLM Context
    COT_KNOWLEDGE = f"""
    ENTITY CONTEXT (Derived from CoT ID '{uid}' and Type '{cot_type}'):
    - DETECTED DOMAIN: {resolved_domain}
    - DETECTED AFFILIATION: {resolved_affil}
    
    TAK/CoT DECODING RULES:
    1. Type Hierarchy: atom-affiliation-domain-platform-subplatform (e.g., a-f-A-C-F)
    2. Domains: A=Air, S=Surface(Sea), G=Ground, s=Space.
    3. Platforms: C=Civilian, M=Military.
    4. Identifiers: 
       - 6-character hex string (e.g. a1b2c3) -> Aviation (ICAO Address).
       - 9-digit numeric string (e.g. 123456789) -> Maritime (MMSI).
       - SAT-XXXXX -> Satellite.
    """

    personas = {
        "tactical": {
            "system": f"You are a Tactical Intelligence Analyst. Focus on telemetry anomalies, trajectory analysis, and speed/altitude fluctuations. Be concise and professional.\n{COT_KNOWLEDGE}",
            "instruction": "Provide a tactical assessment. Use **Section Header:** format for clarity with two line breaks between sections."
        },
        "osint": {
            "system": f"You are an OSINT Specialist. Focus on entity identification, callsign/registration matching, and identifying potential spoofing or 'ghost' behavior.\n{COT_KNOWLEDGE}",
            "instruction": "Analyze the identity and metadata. Use **Section Header:** format for clarity with two line breaks between sections."
        },
        "sar": {
            "system": f"You are a Search and Rescue Coordinator. Look for circular patterns, sudden stops, or rapid altitude changes that indicate distress.\n{COT_KNOWLEDGE}",
            "instruction": "Evaluate if this track exhibits characteristics of a vehicle in distress. Use **Section Header:** format for clarity with two line breaks between sections."
        }
    }
    
    selected_persona = personas.get(req.mode.lower(), personas["tactical"])
    system_prompt = selected_persona["system"]

    meta = track_summary['meta'] or {}
    if isinstance(meta, str):
        import json
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
            
    callsign = meta.get('callsign') or meta.get('flight') or "Unknown"
    reg = meta.get('registration') or "Unknown"

    user_content = f"""
    TARGET: {uid}
    DATA SOURCE: {track_summary['type']}
    IDENTIFIERS: Callsign: {callsign}, Reg: {reg}
    
    TELEMETRY SUMMARY ({req.lookback_hours}h window):
    - Data Points: {track_summary['points']}
    - Speed: Avg {track_summary['avg_speed'] or 0:.1f} m/s (Range: {track_summary['min_speed'] or 0:.1f} - {track_summary['max_speed'] or 0:.1f})
    - Altitude: Avg {track_summary['avg_alt'] or 0:.0f} m (Range: {track_summary['min_alt'] or 0:.0f} - {track_summary['max_alt'] or 0:.0f})
    - Last Seen: {track_summary['last_seen']}
    {intel_context}
    
    INSTRUCTION: {selected_persona['instruction']}
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
    # Resolve the model parameters (including base_url, api_key if provided)
    model_params = _MODEL_MAP.get(active_model, {"model": active_model})
    target_model_str = model_params.get("model", active_model)
    
    logger.info(f"Running analysis for {uid} with model {active_model!r} -> {target_model_str}")

    async def event_generator():
        try:
            response = await acompletion(
                **model_params,
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
            logger.error(f"AI analysis failed for {uid} (model={target_model_str!r}): {e}")
            yield {"event": "error", "data": str(e)}

    return EventSourceResponse(event_generator())
