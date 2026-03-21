import logging
import os
import yaml
import json
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
    request: Request,
    req: AnalyzeRequest,
    uid: str = Path(..., max_length=100)
):
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

    # Rate Limiting
    if db.redis_client and request.client and request.client.host:
        client_ip = request.client.host
        rl_key = f"rate_limit:analyze:{client_ip}"
        try:
            # Atomic rate limit increment
            req_count = await db.redis_client.incr(rl_key)
            if req_count == 1:
                await db.redis_client.expire(rl_key, 60)

            if req_count > 10:
                raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again later.")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Rate limiting error: {e}")

    # 1. Fetch Track History (Intel Bump 2)
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
        ),
        waypoints AS (
            SELECT lat, lon, alt, speed, time
            FROM tracks
            WHERE entity_id = $1
            AND time > NOW() - INTERVAL '1 hour' * $2
            ORDER BY time DESC
            LIMIT 10
        )
        SELECT s.*, m.type, m.meta, 
               (SELECT json_agg(w) FROM waypoints w) as waypoint_history
        FROM summary s, metadata m
    """
    try:
        track_summary = await db.pool.fetchrow(track_query, uid, req.lookback_hours)
    except Exception as e:
        logger.error(f"Analysis track query failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    # 1.1 FALLBACKS: SATELLITES, TOWERS, RF SITES, INFRA
    if (not track_summary or track_summary['points'] == 0):
        # 1.1.1 SATELLITE FALLBACK
        if uid.startswith("SAT-"):
            norad_id = uid.replace("SAT-", "")
            async with db.pool.acquire() as conn:
                sat_row = await conn.fetchrow("SELECT name, category, constellation, tle_line1, tle_line2 FROM satellites WHERE norad_id=$1", norad_id)
            if sat_row and sat_row['tle_line1'] and sat_row['tle_line2']:
                try:
                    satrec = Satrec.twoline2rv(sat_row['tle_line1'], sat_row['tle_line2'])
                    now = datetime.now(timezone.utc)
                    points = []
                    for i in range(10):
                        t = now - timedelta(hours=req.lookback_hours*(i/10))
                        jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute, t.second + t.microsecond/1e6)
                        e, r, v = satrec.sgp4(jd, fr)
                        if e == 0:
                            r_ecef = teme_to_ecef(np.array(r), jd, fr)
                            lat, lon, alt = ecef_to_lla_vectorized(r_ecef.reshape(1, 3))
                            points.append({"lat": lat[0], "lon": lon[0], "alt": alt[0]*1000, "speed": np.linalg.norm(r)*1000, "time": t.isoformat()})
                    if points:
                        track_summary = {
                            'start_time': points[-1]['time'], 'last_seen': points[0]['time'], 'points': len(points),
                            'avg_speed': sum(p['speed'] for p in points)/len(points), 'min_speed': min(p['speed'] for p in points), 'max_speed': max(p['speed'] for p in points),
                            'avg_alt': sum(p['alt'] for p in points)/len(points), 'min_alt': min(p['alt'] for p in points), 'max_alt': max(p['alt'] for p in points),
                            'centroid_geom': f"SRID=4326;POINT({points[0]['lon']} {points[0]['lat']})",
                            'type': 'a-s-K', 'waypoint_history': points,
                            'meta': {'callsign': sat_row['name'], 'classification': {'category': sat_row['category'], 'constellation': sat_row['constellation']}}
                        }
                except Exception as e: logger.warning(f"Satellite fallback synthesis failed: {e}")

        # 1.1.2 TOWER FALLBACK (PostgreSQL)
        if (not track_summary or track_summary['points'] == 0):
            try:
                tower = await db.pool.fetchrow("SELECT * FROM infra_towers WHERE id::text = $1 OR fcc_id = $1", uid)
                if tower:
                    track_summary = {
                        'start_time': tower['updated_at'], 'last_seen': tower['updated_at'], 'points': 1,
                        'avg_speed': 0, 'min_speed': 0, 'max_speed': 0,
                        'avg_alt': tower['elevation_m'] or 0, 'min_alt': tower['elevation_m'] or 0, 'max_alt': tower['elevation_m'] or 0,
                        'centroid_geom': tower['geom'],
                        'type': 'u-G-T', # Unknown-Ground-Tower
                        'meta': {
                            'callsign': f"FCC TOWER: {tower['fcc_id']}",
                            'owner': tower['owner'],
                            'status': tower['status'],
                            'height_m': tower['height_m'],
                            'elevation_m': tower['elevation_m']
                        },
                        'waypoint_history': [{'lat': tower['lat'], 'lon': tower['lon'], 'alt': tower['elevation_m'] or 0, 'time': tower['updated_at'].isoformat()}]
                    }
            except Exception as e: logger.warning(f"Tower fallback failed: {e}")

        # 1.1.3 RF SITE FALLBACK (PostgreSQL)
        if (not track_summary or track_summary['points'] == 0):
            try:
                site = await db.pool.fetchrow("SELECT * FROM rf_sites WHERE id::text = $1 OR site_id = $1", uid)
                if site:
                    track_summary = {
                        'start_time': site['updated_at'], 'last_seen': site['updated_at'], 'points': 1,
                        'avg_speed': 0, 'min_speed': 0, 'max_speed': 0,
                        'avg_alt': 0, 'min_alt': 0, 'max_alt': 0,
                        'centroid_geom': site['geom'],
                        'type': 'u-G-R', # Unknown-Ground-Radio
                        'meta': {
                            'callsign': site['callsign'] or site['name'],
                            'source': site['source'],
                            'service': site['service'],
                            'modes': site['modes']
                        },
                        'waypoint_history': [{'lat': site['lat'], 'lon': site['lon'], 'alt': 0, 'time': site['updated_at'].isoformat()}]
                    }
            except Exception as e: logger.warning(f"RF Site fallback failed: {e}")

        # 1.1.4 CABLE / STATIC INFRA FALLBACK (Redis)
        if (not track_summary or track_summary['points'] == 0) and db.redis_client:
            try:
                for key in ["infra:cables", "infra:stations", "infra:outages"]:
                    raw = await db.redis_client.get(key)
                    if not raw: continue
                    data = json.loads(raw)
                    features = data.get('features', [])
                    for f in features:
                        if str(f.get('id')) == uid or str(f.get('properties', {}).get('id')) == uid:
                            props = f.get('properties', {})
                            geom = f.get('geometry', {})
                            coords = geom.get('coordinates', [0, 0])
                            
                            # Flatten coordinates (simplified for Analyst context)
                            if isinstance(coords[0], list) and not isinstance(coords[0][0], (int, float)):
                                lon, lat = coords[0][0][:2]
                            elif isinstance(coords[0], list):
                                lon, lat = coords[0][:2]
                            else:
                                lon, lat = coords[:2]
                                
                            track_summary = {
                                'start_time': datetime.now(timezone.utc), 'last_seen': datetime.now(timezone.utc), 'points': 1,
                                'avg_speed': 0, 'min_speed': 0, 'max_speed': 0,
                                'avg_alt': 0, 'min_alt': 0, 'max_alt': 0,
                                'centroid_geom': f"SRID=4326;POINT({lon} {lat})",
                                'type': 'u-G-I', # Unknown-Ground-Infrastructure
                                'meta': {
                                    'callsign': props.get('name') or props.get('region') or uid,
                                    'entity_type': props.get('entity_type', 'infrastructure'),
                                    'details': props
                                },
                                'waypoint_history': [{'lat': lat, 'lon': lon, 'alt': 0, 'time': datetime.now(timezone.utc).isoformat()}]
                            }
                            break
                    if track_summary: break
            except Exception as e: logger.warning(f"Redis infra fallback failed: {e}")

    if not track_summary or track_summary['points'] == 0:
        async def err(): yield {"event": "error", "data": "No track history or infrastructure metadata found for this entity."}
        return EventSourceResponse(err())

    # 1.5 Multi-Domain Fusion
    intel_context, infra_context, orbital_coverage = "", "", ""

    # Decode waypoints first (Bug Fix)
    waypoints = track_summary.get('waypoint_history', [])
    if isinstance(waypoints, str):
        try: waypoints = json.loads(waypoints)
        except: waypoints = []

    if track_summary.get('centroid_geom'):
        try:
            # Nearby Intel (50km)
            intel_rows = await db.pool.fetch("SELECT content, timestamp FROM intel_reports WHERE ST_DWithin(geom::geography, $1::geography, 50000) ORDER BY timestamp DESC LIMIT 3", track_summary['centroid_geom'])
            if intel_rows:
                intel_context = "\nCORRELATED INTEL REPORTS (50km):\n" + "\n".join([f"- [{r['timestamp']}] {r['content']}" for r in intel_rows])
            
            # Nearby RF Infrastructure (10km)
            infra_rows = await db.pool.fetch("SELECT name, service, ST_Distance(geom::geography, $1::geography) as dist FROM rf_sites WHERE ST_DWithin(geom::geography, $1::geography, 10000) ORDER BY dist LIMIT 5", track_summary['centroid_geom'])
            if infra_rows:
                infra_context = "\nNEARBY RF INFRASTRUCTURE (10km):\n" + "\n".join([f"- {r['name']} ({r['service']}) - {r['dist']/1000:.1f}km" for r in infra_rows])

            # Cable Context (Redis)
            if db.redis_client:
                stations_raw = await db.redis_client.get('infra:cables:landing_stations')
                if stations_raw:
                    stations = json.loads(stations_raw)
                    center_lat, center_lon = 0, 0
                    if waypoints:
                        hp = waypoints[0]
                        center_lat, center_lon = hp['lat'], hp['lon']
                    
                    nearby_stations = [f"{s['name']} (Landing Station - {np.sqrt((s['lat']-center_lat)**2 + (s['lon']-center_lon)**2)*111:.1f}km)" for s in stations if np.sqrt((s['lat']-center_lat)**2 + (s['lon']-center_lon)**2)*111 < 20]
                    if nearby_stations:
                        infra_context += "\nSUBMARINE CABLE PERSPECTIVE:\n" + "\n".join([f"- {ns}" for ns in nearby_stations[:3]])
        except Exception as e: logger.warning(f"Fusion context query failed: {e}")

    # 1.6 Orbital Coverage
    if not uid.startswith("SAT-"):
        try:
            async with db.pool.acquire() as conn:
                intel_sats = await conn.fetch("SELECT name, constellation, tle_line1, tle_line2 FROM satellites WHERE category = 'INTEL' LIMIT 20")
                now = datetime.now(timezone.utc)
                target_lat, target_lon = 0, 0
                if waypoints:
                    hp = waypoints[0]
                    target_lat, target_lon = hp['lat'], hp['lon']

                active = []
                for s in intel_sats:
                    if not s['tle_line1']: continue
                    satrec = Satrec.twoline2rv(s['tle_line1'], s['tle_line2'])
                    jd, fr = jday(now.year, now.month, now.day, now.hour, now.minute, now.second)
                    e, r, v = satrec.sgp4(jd, fr)
                    if e == 0:
                        dist_to_center = np.linalg.norm(r)
                        if dist_to_center > 6371:
                            footprint_radius = np.degrees(np.arccos(6371 / dist_to_center)) 
                            r_ecef = teme_to_ecef(np.array(r), jd, fr)
                            slat, slon, _ = ecef_to_lla_vectorized(r_ecef.reshape(1, 3))
                            angular_dist = np.degrees(np.arccos(np.sin(np.radians(slat[0]))*np.sin(np.radians(target_lat)) + np.cos(np.radians(slat[0]))*np.cos(np.radians(target_lat))*np.cos(np.radians(slon[0]-target_lon))))
                            if angular_dist < footprint_radius: active.append(f"{s['name']} ({s['constellation']})")
                if active:
                    orbital_coverage = "\nACTIVE ORBITAL OVERPASS (INTEL):\n" + "\n".join([f"- {a}" for a in active])
        except Exception as e: logger.warning(f"Orbital coverage check failed: {e}")

    # 2. Prompt Construction
    cot_type = track_summary.get('type', 'u-u-U')
    parts = cot_type.split('-')
    affiliation = {'f':'FRIENDLY','h':'HOSTILE','s':'SUSPECT','n':'NEUTRAL','u':'UNKNOWN'}.get(parts[1] if len(parts)>1 else 'u','UNKNOWN')
    domain = {'A':'AIR','S':'SURFACE','G':'GROUND','s':'SPACE','K':'SPACE'}.get(parts[2] if len(parts)>2 else 'u','UNKNOWN')

    personas = {
        "tactical": {"sys": f"Tactical Analyst. Domain: {domain}, Affil: {affiliation}.", "inst": "Tactical assessment. Section Headers."},
        "osint": {"sys": f"OSINT Specialist. Domain: {domain}, Affil: {affiliation}.", "inst": "Identity/meta analysis. Section Headers."},
        "sar": {"sys": f"SAR Coordinator. Domain: {domain}, Affil: {affiliation}.", "inst": "Distress evaluation. Section Headers."}
    }
    persona = personas.get(req.mode.lower(), personas["tactical"])
    
    meta = track_summary['meta'] or {}
    if isinstance(meta, str):
        try: meta = json.loads(meta)
        except: meta = {}
    label = f"{meta.get('callsign','Unknown')} ({meta.get('registration','Unknown')})"

    traj_context = ""
    if waypoints:
        traj_context = "\nLAST 10 WAYPOINTS:\n" + "\n".join([f"- [{p['time']}] {p['lat']:.4f}, {p['lon']:.4f} @ {p['alt'] or 0:.0f}m" for p in waypoints])

    user_content = f"TARGET: {uid} | Ident: {label} | History ({req.lookback_hours}h): {track_summary['points']} pts. {traj_context} {intel_context} {infra_context} {orbital_coverage} \nINST: {persona['inst']} \nASSESS:"

    # 3. Model & Streaming
    active_model = AI_MODEL_DEFAULT
    if db.redis_client:
        stored = await db.redis_client.get(AI_MODEL_REDIS_KEY)
        if stored: active_model = stored
    
    model_params = _MODEL_MAP.get(active_model, {"model": active_model})
    async def ev_gen():
        try:
            response = await acompletion(**model_params, messages=[{"role":"system","content":persona["sys"]},{"role":"user","content":user_content}], stream=True)
            async for chunk in response:
                if content := chunk.choices[0].delta.content: yield {"data": content}
        except Exception as e:
            logger.error(f"Analysis error: {e}")
            yield {"event": "error", "data": str(e)}

    return EventSourceResponse(ev_gen())