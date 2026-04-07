import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
from core.auth import require_role
from core.database import db
from fastapi import APIRouter, Depends, HTTPException, Path, Request
from models.schemas import AnalyzeRequest
from sgp4.api import Satrec, jday
from sse_starlette.sse import EventSourceResponse
from utils.sgp4_utils import ecef_to_lla_vectorized, teme_to_ecef

from services.ai_service import ai_service
from services.escalation_detector import EscalationDetector

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Analysis")
escalation_detector = EscalationDetector()


def _parse_jsonb(val: Any) -> dict:
    """Safe-parse JSONB field that might be stringified."""
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return {}
    return {}


def _infer_track_domain(uid: str, track_type: str) -> str:
    """Infer operational domain for the selected target."""
    normalized = (track_type or "").upper()
    if uid.startswith("gdelt-"):
        return "OSINT_EVENT"
    if uid.startswith("SAT-") or "-K" in normalized:
        return "ORBITAL"
    if "-A" in normalized:
        return "AIR"
    if "-S" in normalized:
        return "MARITIME"
    if "-G" in normalized or "-T" in normalized:
        return "INFRASTRUCTURE"
    return "UNKNOWN"


def _summarize_waypoints(waypoints: list) -> str:
    """Build a compact telemetry summary for the model prompt."""
    if not waypoints:
        return "No waypoint telemetry available."

    recent = waypoints[:5]
    points = []
    for idx, wp in enumerate(recent, start=1):
        lat = wp.get("lat")
        lon = wp.get("lon")
        alt = wp.get("alt")
        speed = wp.get("speed")
        ts = wp.get("time")
        points.append(
            f"{idx}) lat={lat}, lon={lon}, alt={alt}, speed={speed}, time={ts}"
        )

    return "\n".join(points)


@router.post("/api/analyze/{uid}", dependencies=[Depends(require_role("operator"))])
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
                h = p.get("headline") or "Unknown Event"
                a1 = p.get("actor1") or "Unknown"
                intel_events.append(f"- {h} | Actor: {a1}")
            intel_text = "\n".join(intel_events) if intel_events else intel_text
            points = len(intel_events)

        track_summary = {
            "type": "u-u-U",
            "points": points or 1,
            "meta": {
                "callsign": "GLOBAL_SITUATION_REPORT",
                "entity_type": "sitrep",
                "sitrep_data": intel_text,
            },
            "waypoint_history": [],
            "centroid_geom": None,
        }

    # --- 2. STANDARD TRACK HISTORY ---
    else:
        if not db.pool:
            raise HTTPException(status_code=503, detail="Database not ready")

        track_query = """
            WITH summary AS (
                SELECT 
                    min(time) as start_time, 
                    max(time) as last_seen, 
                    count(*) as points,
                    ST_Centroid(ST_Collect(geom)) as centroid_geom
                FROM tracks 
                WHERE entity_id = $1 AND time > NOW() - INTERVAL '1 hour' * $2
            ),
            metadata AS (
                SELECT type, meta FROM tracks WHERE entity_id = $1 ORDER BY time DESC LIMIT 1
            ),
            waypoints AS (
                SELECT lat, lon, alt, speed, time FROM tracks 
                WHERE entity_id = $1 AND time > NOW() - INTERVAL '1 hour' * $2 
                ORDER BY time DESC LIMIT 10
            )
            SELECT 
                s.start_time, s.last_seen, s.points, s.centroid_geom,
                m.type, m.meta,
                (SELECT jsonb_agg(w) FROM waypoints w) as waypoint_history
            FROM summary s
            LEFT JOIN metadata m ON true
        """
        try:
            row = await db.pool.fetchrow(
                track_query, lookback_uid, float(req.lookback_hours)
            )
            if row:
                track_summary = dict(row)
        except Exception as e:
            logger.error(f"Analysis track query failed for {uid}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

        # 2.1 Fallbacks (Satellites, Infrastructure, GDELT)
        if not track_summary or track_summary.get("points") == 0:
            if uid.startswith("SAT-"):
                norad_id = uid.replace("SAT-", "")
                async with db.pool.acquire() as conn:
                    sat_row = await conn.fetchrow(
                        "SELECT name, category, constellation, tle_line1, tle_line2 FROM satellites WHERE norad_id=$1",
                        norad_id,
                    )
                if sat_row and sat_row["tle_line1"]:
                    try:
                        satrec = Satrec.twoline2rv(
                            sat_row["tle_line1"], sat_row["tle_line2"]
                        )
                        now = datetime.now(timezone.utc)
                        pts = []
                        for i in range(10):
                            t = now - timedelta(hours=req.lookback_hours * (i / 10))
                            jd, fr = jday(
                                t.year, t.month, t.day, t.hour, t.minute, t.second
                            )
                            e, r, v = satrec.sgp4(jd, fr)
                            if e == 0:
                                r_ecef = teme_to_ecef(r, jd, fr)
                                lat_arr, lon_arr, alt_arr = ecef_to_lla_vectorized(
                                    np.array(r_ecef).reshape(1, 3)
                                )
                                pts.append(
                                    {
                                        "lat": lat_arr[0],
                                        "lon": lon_arr[0],
                                        "alt": alt_arr[0] * 1000,
                                        "time": t.isoformat(),
                                    }
                                )
                        if pts:
                            track_summary = {
                                "points": len(pts),
                                "type": "a-s-K",
                                "waypoint_history": pts,
                                "centroid_geom": f"SRID=4326;POINT({pts[0]['lon']} {pts[0]['lat']})",
                                "meta": {
                                    "callsign": sat_row["name"],
                                    "classification": {"category": sat_row["category"]},
                                },
                            }
                    except Exception as e:
                        logger.warning(f"Sat fallback failed: {e}")

            if not track_summary or track_summary["points"] == 0:
                try:
                    tower = await db.pool.fetchrow(
                        "SELECT * FROM infra_towers WHERE id::text = $1 OR fcc_id = $1",
                        uid,
                    )
                    if tower:
                        track_summary = {
                            "points": 1,
                            "type": "u-G-T",
                            "centroid_geom": tower["geom"],
                            "meta": {"callsign": f"TOWER:{tower['fcc_id']}"},
                            "waypoint_history": [
                                {"lat": tower["lat"], "lon": tower["lon"], "alt": 0}
                            ],
                        }

                    if (
                        not track_summary or track_summary["points"] == 0
                    ) and uid.startswith("gdelt-"):
                        ev_id = uid[6:]
                        gd_row = await db.pool.fetchrow(
                            "SELECT * FROM gdelt_events WHERE event_id = $1", ev_id
                        )
                        if gd_row:
                            track_summary = {
                                "points": 1,
                                "type": "u-G-O",
                                "centroid_geom": gd_row["geom"],
                                "meta": {
                                    "callsign": gd_row["headline"],
                                    "url": gd_row["url"],
                                },
                                "waypoint_history": [
                                    {
                                        "lat": gd_row["lat"],
                                        "lon": gd_row["lon"],
                                        "alt": 0,
                                    }
                                ],
                            }
                except Exception:
                    pass

    if not track_summary or track_summary["points"] == 0:

        async def err():
            yield {"event": "error", "data": "No telemetry or metadata buffer found."}

        return EventSourceResponse(err())

    # Decode waypoints
    waypoints = track_summary.get("waypoint_history") or []
    if isinstance(waypoints, str):
        try:
            waypoints = json.loads(waypoints)
        except Exception:
            waypoints = []

    # --- 3. HEURISTIC ESCALATION DETECTION ---
    behavioral_signals = []
    if track_summary and track_summary.get("centroid_geom"):
        try:
            # Query clausal_chains for behavioral signals in the vicinity (50km)
            tak_query = """
                SELECT DISTINCT ON (uid) uid, locative_lat, locative_lon, source, predicate_type, adverbial_context
                FROM clausal_chains
                WHERE geom && ST_Expand($1::geometry, 0.5) -- Approx 50km
                  AND time > NOW() - INTERVAL '30 minutes'
                ORDER BY uid, time DESC
            """
            rows = await db.pool.fetch(tak_query, track_summary["centroid_geom"])
            tak_clauses = [
                {
                    "uid": r["uid"],
                    "locative_lat": r["locative_lat"],
                    "locative_lon": r["locative_lon"],
                    "source": r["source"],
                    "predicate_type": r["predicate_type"],
                    "adverbial_context": _parse_jsonb(r["adverbial_context"]),
                }
                for r in rows
            ]

            # Run detectors
            rendezvous = escalation_detector.detect_rendezvous(tak_clauses)
            if rendezvous:
                behavioral_signals.append(
                    f"[SIGNAL] Multi-entity rendezvous: {rendezvous.description}"
                )

            clustering = escalation_detector.detect_anomaly_concentration(tak_clauses)
            if clustering:
                behavioral_signals.append(
                    f"[SIGNAL] Behavioral clustering: {clustering.description}"
                )

            emergency = escalation_detector.detect_emergency_transponders(tak_clauses)
            if emergency:
                behavioral_signals.append(
                    f"[SIGNAL] Emergency Squawk: {emergency.description}"
                )
        except Exception as e:
            logger.warning(f"Escalation detection failed for analysis: {e}")

    # Fusion variables (preserved but cleaned)
    intel_context = ""
    if track_summary and track_summary.get("centroid_geom"):
        try:
            intel_rows = await db.pool.fetch(
                "SELECT content, timestamp FROM intel_reports WHERE ST_DWithin(geom::geography, $1::geography, 50000) ORDER BY timestamp DESC LIMIT 3",
                track_summary["centroid_geom"],
            )
            if intel_rows:
                intel_context = "\nCORRELATED INTEL (50km):\n" + "\n".join(
                    [f"- [{r['timestamp']}] {r['content']}" for r in intel_rows]
                )
        except Exception:
            pass

    # --- 4. PERSONA & PROMPT ---
    mode_normalized = (req.mode or "tactical").strip().lower()
    persona = ai_service.get_persona(
        mode_normalized,
        context={
            "is_hold": is_hold, 
            "is_gdelt": uid.startswith("gdelt-"),
            "is_sitrep": is_sitrep
        },
    )

    meta = track_summary.get("meta") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}

    label = meta.get("callsign", "Unknown") if isinstance(meta, dict) else "Unknown"
    track_type = track_summary.get("type", "unknown")
    inferred_domain = _infer_track_domain(uid, track_type)
    waypoint_brief = _summarize_waypoints(waypoints)
    prefix = "[HOLDING DETECTED] " if is_hold else ""

    signals_text = (
        "\nBEHAVIORAL SIGNALS (RECENT):\n" + "\n".join(behavioral_signals)
        if behavioral_signals
        else ""
    )

    user_content = (
        f"TARGET: {uid}\n"
        f"LABEL: {prefix}{label}\n"
        f"MODE: {mode_normalized}\n"
        f"INFERRED_DOMAIN: {inferred_domain}\n"
        f"TRACK_TYPE: {track_type}\n"
        f"HISTORY_POINTS: {track_summary['points']}\n"
        f"RECENT_WAYPOINTS:\n{waypoint_brief}\n"
        f"{signals_text}\n"
        f"{intel_context}\n"
        f"INST: {persona['inst']}\n"
        "ASSESS:"
    )

    # --- 5. STREAMING ---
    async def ev_gen():
        async for content in ai_service.generate_stream(persona["sys"], user_content):
            yield {"data": content}

    return EventSourceResponse(ev_gen())
