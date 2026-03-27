import json
import logging
import os
from datetime import datetime, timedelta, timezone

import numpy as np
import yaml
from core.database import db
from fastapi import APIRouter, HTTPException, Path, Request
from litellm import acompletion
from models.schemas import AnalyzeRequest
from sgp4.api import Satrec, jday
from sse_starlette.sse import EventSourceResponse
from utils.sgp4_utils import ecef_to_lla_vectorized, teme_to_ecef

from routers.system import AI_MODEL_DEFAULT, AI_MODEL_REDIS_KEY

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Analysis")

_LITELLM_CONFIG_PATH = os.getenv("LITELLM_CONFIG_PATH", "/app/litellm_config.yaml")

def _load_model_map() -> dict:
    try:
        with open(_LITELLM_CONFIG_PATH) as f:
            cfg = yaml.safe_load(f)
        model_map = {}
        for m in cfg.get("model_list", []):
            name = m["model_name"]
            params = m.get("litellm_params", {}).copy()
            for key, val in params.items():
                if isinstance(val, str) and val.startswith("os.environ/"):
                    env_var = val.split("/", 1)[1]
                    params[key] = os.getenv(env_var, val)
            model_map[name] = params
        return model_map
    except Exception as e:
        logger.warning(f"Could not load LiteLLM config: {e}")
        return {}

_MODEL_MAP = _load_model_map()

@router.post("/api/analyze/{uid}")
async def analyze_track(
    request: Request, req: AnalyzeRequest, uid: str = Path(..., max_length=100)
):
    # --- REDIS RATE LIMITING ---
    if db.redis_client and request.client and request.client.host:
        client_ip = request.client.host
        rl_key = f"rate_limit:analyze:{client_ip}"
        try:
            req_count = await db.redis_client.incr(rl_key)
            if req_count == 1:
                await db.redis_client.expire(rl_key, 60)
            if req_count > 10:
                raise HTTPException(status_code=429, detail="Rate limit exceeded.")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Rate limiting error: {e}")

    track_summary = None
    is_sitrep = uid.startswith("sitrep-")
    is_hold = uid.startswith("hold-")
    lookback_uid = uid
    if is_hold:
        lookback_uid = uid.replace("hold-", "")

    # --- 1. SITREP LOGIC (Aggregated Intelligence) ---
    if is_sitrep:
        intel_text = "No active metadata buffer."
        points = 0
        
        if isinstance(req.sitrep_context, str):
            intel_text = req.sitrep_context
            points = len(intel_text.split("\n"))
        elif isinstance(req.sitrep_context, dict) and "features" in req.sitrep_context:
            feats = req.sitrep_context.get("features", [])[:25]
            intel_events = []
            for f in feats:
                p = f.get("properties", {})
                h = p.get('headline') or 'Unknown Event'
                a1 = p.get('actor1') or 'Unknown'
                intel_events.append(f"- {h} | Actor: {a1}")
            intel_text = "\n".join(intel_events) if intel_events else intel_text
            points = len(intel_events)

        track_summary = {
            "type": "u-u-U",
            "points": points or 1,
            "meta": {
                "callsign": "GLOBAL_SITUATION_REPORT",
                "entity_type": "sitrep",
                "sitrep_data": intel_text
            },
            "waypoint_history": [],
            "centroid_geom": None
        }

    # --- 2. STANDARD TRACK HISTORY ---
    else:
        if not db.pool:
            raise HTTPException(status_code=503, detail="Database not ready")

        track_query = """
            WITH summary AS (
                SELECT min(time) as start_time, max(time) as last_seen, count(*) as points,
                       ST_Centroid(ST_Collect(geom)) as centroid_geom
                FROM tracks WHERE entity_id = $1 AND time > NOW() - INTERVAL '1 hour' * $2
            ),
            metadata AS (
                SELECT type, meta FROM tracks WHERE entity_id = $1 ORDER BY time DESC LIMIT 1
            ),
            waypoints AS (
                SELECT lat, lon, alt, speed, time FROM tracks WHERE entity_id = $1
                AND time > NOW() - INTERVAL '1 hour' * $2 ORDER BY time DESC LIMIT 10
            )
            SELECT s.*, m.type, m.meta, (SELECT json_agg(w) FROM waypoints w) as waypoint_history
            FROM summary s, metadata m
        """
        try:
            row = await db.pool.fetchrow(track_query, lookback_uid, req.lookback_hours)
            if row:
                track_summary = dict(row)
        except Exception as e:
            logger.error(f"Analysis track query failed: {e}")
            raise HTTPException(status_code=500, detail="Internal server error")

        # 2.1 Fallbacks
        if not track_summary or track_summary.get("points") == 0:
            if uid.startswith("SAT-"):
                norad_id = uid.replace("SAT-", "")
                async with db.pool.acquire() as conn:
                    sat_row = await conn.fetchrow(
                        "SELECT name, category, constellation, tle_line1, tle_line2 FROM satellites WHERE norad_id=$1", 
                        norad_id
                    )
                if sat_row and sat_row["tle_line1"]:
                    try:
                        satrec = Satrec.twoline2rv(sat_row["tle_line1"], sat_row["tle_line2"])
                        now = datetime.now(timezone.utc)
                        pts = []
                        for i in range(10):
                            t = now - timedelta(hours=req.lookback_hours * (i / 10))
                            jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute, t.second)
                            e, r, v = satrec.sgp4(jd, fr)
                            if e == 0:
                                r_ecef = teme_to_ecef(np.array(r), jd, fr)
                                lat, lon, alt = ecef_to_lla_vectorized(r_ecef.reshape(1, 3))
                                pts.append({"lat": lat[0], "lon": lon[0], "alt": alt[0]*1000, "time": t.isoformat()})
                        if pts:
                            track_summary = {
                                "points": len(pts), 
                                "type": "a-s-K", 
                                "waypoint_history": pts, 
                                "centroid_geom": f"SRID=4326;POINT({pts[0]['lon']} {pts[0]['lat']})",
                                "meta": {
                                    "callsign": sat_row["name"], 
                                    "classification": {"category": sat_row["category"]}
                                }
                            }
                    except Exception as e:
                        logger.warning(f"Sat fallback failed: {e}")

            if not track_summary or track_summary["points"] == 0:
                try:
                    tower = await db.pool.fetchrow("SELECT * FROM infra_towers WHERE id::text = $1 OR fcc_id = $1", uid)
                    if tower:
                        track_summary = {
                            "points": 1, 
                            "type": "u-G-T", 
                            "centroid_geom": tower["geom"], 
                            "meta": {"callsign": f"TOWER:{tower['fcc_id']}"}, 
                            "waypoint_history": [{"lat": tower["lat"], "lon": tower["lon"], "alt": 0}]
                        }
                    
                    if (not track_summary or track_summary["points"] == 0) and uid.startswith("gdelt-"):
                        ev_id = uid[6:]
                        gd_row = await db.pool.fetchrow("SELECT * FROM gdelt_events WHERE event_id = $1", ev_id)
                        if gd_row:
                            track_summary = {
                                "points": 1, 
                                "type": "u-G-O", 
                                "centroid_geom": gd_row["geom"], 
                                "meta": {"callsign": gd_row["headline"], "url": gd_row["url"]}, 
                                "waypoint_history": [{"lat": gd_row["lat"], "lon": gd_row["lon"], "alt": 0}]
                            }
                except Exception:
                    pass

    if not track_summary or track_summary["points"] == 0:
        async def err():
            yield {"event": "error", "data": "No telemetry or metadata buffer found."}
        return EventSourceResponse(err())

    # Decode waypoints
    waypoints = []
    if track_summary:
        waypoints = track_summary.get("waypoint_history", [])
        if isinstance(waypoints, str):
            try:
                waypoints = json.loads(waypoints)
            except Exception:
                waypoints = []

    # Fusion variables (preserved but cleaned)
    intel_context = ""
    if track_summary and track_summary.get("centroid_geom"):
        try:
            intel_rows = await db.pool.fetch(
                "SELECT content, timestamp FROM intel_reports WHERE ST_DWithin(geom::geography, $1::geography, 50000) ORDER BY timestamp DESC LIMIT 3", 
                track_summary["centroid_geom"]
            )
            if intel_rows:
                intel_context = "\nCORRELATED INTEL (50km):\n" + "\n".join([f"- [{r['timestamp']}] {r['content']}" for r in intel_rows])
        except Exception:
            pass

    # --- 4. PERSONA & PROMPT ---
    if is_sitrep:
        persona = {
            "sys": "Strategic Intelligence Director. Focus: Global Conflict Zones & Macro Trends.",
            "inst": "Conduct a comprehensive Situation Report (SITREP). Categorize the active conflict zones, evaluate actor behavior, and assess overall regional stability. Use BOLD section headers."
        }
        user_content = f"SITREP DATA BUFFER:\n{track_summary['meta']['sitrep_data']}\n\nINST: {persona['inst']}\nASSESS:"
    else:
        persona = {"sys": "Tactical Analyst.", "inst": "Assess this specific target behavior."}
        if uid.startswith("gdelt-"):
            persona = {"sys": "Geopolitical Analyst.", "inst": "Assess news event implications."}
        if is_hold:
            persona = {
                "sys": "Tactical Flight Safety & Surveillance Analyst.", 
                "inst": "Conduct an assessment of this AIRCRAFT HOLDING PATTERN. Evaluate for intent (Arrival Delay, Radio Failure, Emergency, or Intelligence Gathering). Use the provided track history to verify pattern stability."
            }
        
        meta = {}
        if track_summary:
            meta = track_summary.get("meta") or {}
        
        label = meta.get('callsign', 'Unknown')
        prefix = "[HOLDING DETECTED] " if is_hold else ""
        user_content = f"TARGET: {uid} | Label: {prefix}{label} | History: {track_summary['points'] if track_summary else 0} pts. {intel_context}\nINST: {persona['inst']}\nASSESS:"

    # --- 5. STREAMING ---
    active_model = AI_MODEL_DEFAULT
    if db.redis_client:
        stored = await db.redis_client.get(AI_MODEL_REDIS_KEY)
        if stored:
            active_model = stored.decode() if hasattr(stored, 'decode') else str(stored)

    model_params = _MODEL_MAP.get(active_model, {"model": active_model})

    async def ev_gen():
        try:
            response = await acompletion(
                **model_params,
                messages=[{"role": "system", "content": persona["sys"]}, {"role": "user", "content": user_content}],
                stream=True,
            )
            async for chunk in response:
                if content := chunk.choices[0].delta.content:
                    yield {"data": content}
        except Exception as e:
            logger.error(f"Analysis error: {e}")
            yield {"event": "error", "data": str(e)}

    return EventSourceResponse(ev_gen())
