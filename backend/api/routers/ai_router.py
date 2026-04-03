"""
AI Router: Orchestrates multi-INT fusion for autonomous threat detection.
Implements spatial-temporal alignment, sequence evaluation, and escalation detection.
"""

import asyncio
import logging
from typing import Dict, List, Optional

import h3
from fastapi import APIRouter, Query
from pydantic import BaseModel

from services.escalation_detector import EscalationDetector
from services.sequence_evaluation_engine import (
    RiskAssessment,
    SequenceEvaluationEngine,
)
from services.spatial_temporal_alignment import SpatialTemporalAlignment
from services.ai_service import ai_service
from core.database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai_router", tags=["AI Router"])

# Lookback hour boundaries for mapping to alignment engine keys
_HOURS_IN_DAY = 24
_HOURS_IN_WEEK = 168

# Maximum concurrent DB evaluations for the heatmap endpoint
_HEATMAP_MAX_CONCURRENCY = 4

# Keep UI interactions responsive even if the model endpoint is slow/unreachable.
_LLM_EVAL_TIMEOUT_SECONDS = 8.0
_GDELT_SPATIAL_RADIUS_M = 250_000.0


def _compute_gdelt_conflict_score(gdelt_events: List[Dict]) -> float:
    """Derive a lightweight conflict-intensity score from raw GDELT events.

    This provides a non-zero geopolitical baseline in regions with sustained
    conflict-coded GDELT activity, even when TAK anomalies are currently quiet.
    """
    if not gdelt_events:
        return 0.0

    total = len(gdelt_events)
    conflict_events = 0
    material_conflict_events = 0
    tone_values: List[float] = []

    for event in gdelt_events:
        quad_class = event.get("quad_class")
        if quad_class in (3, 4):
            conflict_events += 1
        if quad_class == 4:
            material_conflict_events += 1

        tone = event.get("tone")
        if isinstance(tone, (int, float)):
            tone_values.append(float(tone))

    conflict_ratio = conflict_events / total
    material_ratio = material_conflict_events / total
    avg_tone = (sum(tone_values) / len(tone_values)) if tone_values else 0.0
    hostility = max(0.0, min(1.0, (-avg_tone) / 10.0))

    return min(1.0, 0.6 * conflict_ratio + 0.3 * material_ratio + 0.1 * hostility)


class EvaluationRequest(BaseModel):
    """Request for regional escalation evaluation."""

    h3_region: str  # H3-7 hexagonal cell
    lookback_hours: int = 24
    include_gdelt: bool = True
    include_tak: bool = True
    # When True the LLM narrative step is skipped (used internally for heatmaps
    # to avoid fanning out N LLM calls per heatmap request).
    lightweight: bool = False
    is_sitrep: bool = False


class RiskAssessmentResponse(BaseModel):
    """Response with risk assessment."""

    h3_region_id: str
    risk_score: float
    narrative_summary: str
    anomalous_uids: List[str]
    escalation_indicators: List[str]
    confidence: float
    pattern_detected: bool
    anomaly_count: int


def _h3_cell_to_wkt(h3_cell: str) -> Optional[str]:
    """Convert an H3 cell ID to a WKT POLYGON string suitable for PostGIS.

    Returns ``None`` when the cell ID is invalid so callers can skip the
    spatial filter rather than raising an exception.
    """
    try:
        boundary = h3.cell_to_boundary(h3_cell)  # list of (lat, lon) tuples
        # PostGIS WKT expects (lon lat) ordering; close the ring
        coords = [(lon, lat) for lat, lon in boundary]
        coords.append(coords[0])
        ring = ", ".join(f"{lon} {lat}" for lon, lat in coords)
        return f"POLYGON(({ring}))"
    except Exception as exc:
        logger.warning("Invalid H3 cell '%s': %s", h3_cell, exc)
        return None


@router.post("/evaluate")
async def evaluate_regional_escalation(
    request: EvaluationRequest,
) -> RiskAssessmentResponse:
    """
    Evaluate escalation risk for a specific H3 region.

    Queries clausal_chains table for both TAK and GDELT events,
    applies spatial-temporal alignment, detects patterns, and routes through LLM.

    Args:
        request: EvaluationRequest with region and parameters

    Returns:
        RiskAssessmentResponse with structured risk evaluation
    """
    logger.info(
        f"🧠 [UNIFIED-BRAIN] Evaluating region {request.h3_region} with {request.lookback_hours}h lookback"
    )

    # Initialize services
    alignment_engine = SpatialTemporalAlignment()
    escalation_detector = EscalationDetector()

    # Fetch clausal chains and context data from database
    async with db.pool.acquire() as conn:
        # Query clausal_chains for TAK and GDELT data
        lookback_hours = request.lookback_hours

        # Build spatial filter from H3 cell using the GIST index on clausal_chains.geom
        wkt_polygon = _h3_cell_to_wkt(request.h3_region)

        # GDELT events – sourced from gdelt_events with aliases expected by
        # SpatialTemporalAlignment (event_latitude/event_longitude/event_date).
        gdelt_events = []
        if request.include_gdelt:
            if wkt_polygon:
                gdelt_query = """
                    SELECT
                        event_id AS event_id_cnty,
                        to_char(COALESCE(event_date, time::date), 'YYYYMMDD') AS event_date,
                        lat AS event_latitude,
                        lon AS event_longitude,
                        event_code,
                        headline AS event_text,
                        quad_class,
                        tone,
                        goldstein
                    FROM gdelt_events
                    WHERE time > now() - ($1 * interval '1 hour')
                      AND ST_DWithin(
                        geom::geography,
                        ST_Centroid(ST_GeomFromText($2, 4326))::geography,
                        $3
                      )
                    ORDER BY time DESC
                """
                rows = await conn.fetch(
                    gdelt_query,
                    lookback_hours,
                    wkt_polygon,
                    _GDELT_SPATIAL_RADIUS_M,
                )
            else:
                gdelt_query = """
                    SELECT
                        event_id AS event_id_cnty,
                        to_char(COALESCE(event_date, time::date), 'YYYYMMDD') AS event_date,
                        lat AS event_latitude,
                        lon AS event_longitude,
                        event_code,
                        headline AS event_text,
                        quad_class,
                        tone,
                        goldstein
                    FROM gdelt_events
                    WHERE time > now() - ($1 * interval '1 hour')
                    ORDER BY time DESC
                """
                rows = await conn.fetch(gdelt_query, lookback_hours)
            gdelt_events = [dict(row) for row in rows]

        # TAK events – filtered to the H3 region when possible
        tak_events = []
        if request.include_tak:
            if wkt_polygon:
                tak_query = """
                    SELECT time, uid, source, predicate_type, locative_lat, locative_lon,
                           state_change_reason, narrative_summary, adverbial_context
                    FROM clausal_chains
                    WHERE source IN ('TAK_ADSB', 'TAK_AIS')
                      AND time > now() - ($1 * interval '1 hour')
                      AND ST_Within(geom, ST_GeomFromText($2, 4326))
                    ORDER BY time DESC
                """
                rows = await conn.fetch(tak_query, lookback_hours, wkt_polygon)
            else:
                tak_query = """
                    SELECT time, uid, source, predicate_type, locative_lat, locative_lon,
                           state_change_reason, narrative_summary, adverbial_context
                    FROM clausal_chains
                    WHERE source IN ('TAK_ADSB', 'TAK_AIS')
                      AND time > now() - ($1 * interval '1 hour')
                    ORDER BY time DESC
                """
                rows = await conn.fetch(tak_query, lookback_hours)
            tak_events = [dict(row) for row in rows]

        # Fetch context data for multi-INT correlation
        # Internet outages (most recent in window)
        outage_data = None
        if wkt_polygon:
            outage_query = """
                SELECT time, country_code, severity, asn_name, affected_nets
                FROM internet_outages
                WHERE time > now() - ($1 * interval '1 hour')
                  AND ST_Within(geom, ST_GeomFromText($2, 4326))
                ORDER BY severity DESC, time DESC
                LIMIT 1
            """
            outage_row = await conn.fetchrow(outage_query, lookback_hours, wkt_polygon)
        else:
            outage_query = """
                SELECT time, country_code, severity, asn_name, affected_nets
                FROM internet_outages
                WHERE time > now() - ($1 * interval '1 hour')
                ORDER BY severity DESC, time DESC
                LIMIT 1
            """
            outage_row = await conn.fetchrow(outage_query, lookback_hours)
        if outage_row:
            outage_data = dict(outage_row)

        # Space weather context (most significant event in window)
        space_weather_data = None
        space_weather_query = """
            SELECT time, kp_index, kp_category, dst_index, explanation
            FROM space_weather_context
            WHERE time > now() - ($1 * interval '1 hour')
            ORDER BY kp_index DESC, time DESC
            LIMIT 1
        """
        space_weather_row = await conn.fetchrow(space_weather_query, lookback_hours)
        if space_weather_row:
            space_weather_data = dict(space_weather_row)

        # SatNOGS signal events (any signal loss detected)
        signal_events = []
        signal_query = """
            SELECT time, norad_id, ground_station_name, signal_strength, modulation, frequency
            FROM satnogs_signal_events
            WHERE time > now() - ($1 * interval '1 hour')
              AND signal_strength < $2
            ORDER BY signal_strength ASC, time DESC
            LIMIT 10
        """
        signal_rows = await conn.fetch(signal_query, lookback_hours, -10.0)
        signal_events = [dict(row) for row in signal_rows]

    # Check space-weather signal-loss suppression key (set by NOAA-scales poller
    # when R3+ Radio Blackout or G3+ Geomagnetic Storm is active).  When suppressed,
    # skip signal-loss detection to avoid false-positive jamming/interference alerts.
    import json as _json
    _suppression_raw = await db.redis_client.get("space_weather:suppress_signal_loss") if db.redis_client else None
    _suppression_payload = _json.loads(_suppression_raw) if _suppression_raw else None
    _signal_loss_suppressed = EscalationDetector.should_suppress_signal_loss(_suppression_payload)
    if _signal_loss_suppressed:
        logger.warning(
            "Signal-loss detection SUPPRESSED for region %s — active space weather: %s",
            request.h3_region,
            _suppression_payload.get("reason", "unknown") if _suppression_payload else "",
        )

    gdelt_conflict_score = _compute_gdelt_conflict_score(gdelt_events)

    # Map lookback_hours to one of the keys that SpatialTemporalAlignment.LOOKBACK_WINDOWS
    # recognises.  Passing an unsupported value (e.g. '168h') silently fell back to '24h',
    # making the 7-day option ineffective.
    if request.lookback_hours <= _HOURS_IN_DAY:
        lookback_window_key = "24h"
    elif request.lookback_hours <= _HOURS_IN_WEEK:
        lookback_window_key = "7d"
    else:
        lookback_window_key = "30d"

    # Align clauses spatially/temporally
    aligned = await alignment_engine.align_clauses(
        h3_region=request.h3_region,
        clausal_chains=tak_events,
        gdelt_events=gdelt_events,
        lookback_window=lookback_window_key,
    )

    # Detect escalation patterns in GDELT
    pattern_match, pattern_confidence = escalation_detector.detect_pattern(
        [
            {
                "event_code": clause.predicate_type,
                "narrative": clause.narrative,
            }
            for clause in aligned.gdelt_clauses
        ]
    )

    # Detect TAK anomalies
    tak_dicts = [
        {
            "uid": clause.uid,
            "locative_lat": clause.lat,
            "locative_lon": clause.lon,
            # Prefer actual adverbial_context from the clause if available; otherwise use the legacy placeholder
            "adverbial_context": getattr(clause, "adverbial_context", None)
            or {"course": 0.0},
        }
        for clause in aligned.tak_clauses
    ]

    clustering_anomaly = escalation_detector.detect_anomaly_concentration(
        tak_dicts, request.h3_region
    )
    directional_anomalies = escalation_detector.detect_directional_anomalies(tak_dicts)
    emergency_anomalies = escalation_detector.detect_emergency_transponders(tak_dicts)
    rendezvous_anomalies = escalation_detector.detect_rendezvous(tak_dicts)

    all_anomalies = (
        [clustering_anomaly]
        + directional_anomalies
        + emergency_anomalies
        + rendezvous_anomalies
    )
    active_anomalies = [a for a in all_anomalies if a.score > 0.0]
    anomaly_score = max([a.score for a in all_anomalies], default=0.0)
    anomalous_uids = []
    for anomaly in active_anomalies:
        anomalous_uids.extend(anomaly.affected_uids)
    anomalous_uids = list(set(anomalous_uids))

    # Detect contextual anomalies (multi-INT correlation)
    context_anomalies = []

    # Internet outage correlation
    if outage_data:
        outage_anomaly = escalation_detector.detect_internet_outage_correlation(
            outage_data
        )
        context_anomalies.append(outage_anomaly)
        logger.info(f"Detected internet outage: {outage_anomaly.description}")

    # Space weather correlation
    if space_weather_data:
        space_weather_anomaly = escalation_detector.detect_space_weather_anomaly(
            space_weather_data.get("kp_index")
        )
        context_anomalies.append(space_weather_anomaly)
        logger.info(f"Space weather context: {space_weather_anomaly.description}")

    # Satellite signal loss detection — skipped when space weather suppression is active
    if signal_events and not _signal_loss_suppressed:
        signal_anomalies = escalation_detector.detect_satnogs_signal_loss(signal_events)
        context_anomalies.extend(signal_anomalies)
        for anomaly in signal_anomalies:
            logger.info(f"Detected signal loss: {anomaly.description}")

    # Use the stronger of sequence-pattern confidence and raw conflict intensity
    # so conflict-heavy GDELT windows can contribute even without exact pattern matches.
    pattern_input = max(pattern_confidence, gdelt_conflict_score)

    # Compute composite risk score with context-aware dampening/boosting
    risk_score = escalation_detector.compute_risk_score(
        pattern_confidence=pattern_input,
        anomaly_score=anomaly_score,
        alignment_score=aligned.alignment_score,
        anomaly_count=len(active_anomalies),
        context_anomalies=context_anomalies if context_anomalies else None,
    )

    # Build narrative summaries for LLM
    gdelt_summary = "\n".join(
        [
            f"[{c.time.strftime('%H:%M')}] {c.predicate_type}: {c.narrative or 'N/A'}"
            for c in aligned.gdelt_clauses[:5]
        ]
    )
    tak_summary = "\n".join(
        [
            f"[{c.time.strftime('%H:%M')}] {c.uid} ({c.source}): {c.predicate_type}"
            for c in aligned.tak_clauses[:5]
        ]
    )

    # Collect heuristic behavioral signals from active anomalies
    behavioral_signals = [a.description for a in active_anomalies if a.description]
    # Add context anomalies (outages, space weather)
    behavioral_signals.extend(
        [a.description for a in context_anomalies if a.score > 0.1]
    )

    # Initialize LLM-based sequence evaluation if risk is elevated.
    # Lightweight mode (used by the heatmap endpoint) skips the LLM call to
    # avoid fanning out expensive model requests per heatmap cell.
    narrative_summary = "No significant escalation detected"
    confidence = 0.5

    if risk_score > 0.3 and not request.lightweight:
        try:
            logger.info(
                "🧠 [UNIFIED-BRAIN] Evaluating region %s with %d behavioral signals detected",
                request.h3_region,
                len(behavioral_signals),
            )
            evaluation_engine = SequenceEvaluationEngine()

            # Call LLM for detailed analysis
            assessment: RiskAssessment = await asyncio.wait_for(
                evaluation_engine.evaluate_escalation(
                    h3_region=request.h3_region,
                    gdelt_summary=gdelt_summary,
                    tak_summary=tak_summary,
                    anomalous_uids=anomalous_uids,
                    behavioral_signals=behavioral_signals,
                    is_sitrep=request.is_sitrep,
                ),
                timeout=_LLM_EVAL_TIMEOUT_SECONDS,
            )

            narrative_summary = assessment.narrative_summary
            confidence = assessment.confidence
            # Risk score from LLM can override if confidence is high
            if confidence > 0.7:
                risk_score = assessment.risk_score

        except TimeoutError:
            logger.warning(
                "LLM evaluation timed out after %.1fs, using heuristic scoring",
                _LLM_EVAL_TIMEOUT_SECONDS,
            )
        except Exception as e:
            logger.warning(f"LLM evaluation failed, using heuristic scoring: {e}")

    # Detect escalation indicators
    escalation_indicators = []
    if pattern_match:
        escalation_indicators.append("GDELT pattern matched")
    elif gdelt_conflict_score >= 0.25:
        escalation_indicators.append("GDELT conflict intensity elevated")
    if clustering_anomaly.score > 0.5:
        escalation_indicators.append("Entity clustering detected")
    if directional_anomalies:
        escalation_indicators.append("Directional anomalies detected")
    if emergency_anomalies:
        escalation_indicators.append("Emergency transponders activated")
    if rendezvous_anomalies:
        total_rendezvous = sum(len(a.affected_uids) for a in rendezvous_anomalies)
        escalation_indicators.append(
            f"Multi-entity rendezvous detected ({total_rendezvous} entities)"
        )

    # Space-weather suppression indicator
    if _signal_loss_suppressed and _suppression_payload:
        escalation_indicators.append(
            f"Signal-loss alerts suppressed: {_suppression_payload.get('reason', 'space weather')}"
        )

    # Context-based indicators
    for ctx_anomaly in context_anomalies:
        if ctx_anomaly.metric_type == "internet_outage" and ctx_anomaly.score > 0.5:
            escalation_indicators.append(
                f"Internet outage detected (severity: {ctx_anomaly.score:.2f})"
            )
        elif ctx_anomaly.metric_type == "space_weather" and ctx_anomaly.score > 0.5:
            escalation_indicators.append(
                f"Space weather event (Kp: {ctx_anomaly.description})"
            )
        elif ctx_anomaly.metric_type == "satellite_signal_loss":
            escalation_indicators.append(
                f"Satellite signal loss detected ({ctx_anomaly.affected_uids[0] if ctx_anomaly.affected_uids else 'unknown'})"
            )

    # Trigger Tier 3 escalation if risk is very high
    if risk_score > 0.8:
        logger.warning(
            f"HIGH RISK detected in region {request.h3_region}: {risk_score:.2f}"
        )
        escalation_indicators.append("ESCALATE_TO_TIER3")

    return RiskAssessmentResponse(
        h3_region_id=request.h3_region,
        risk_score=risk_score,
        narrative_summary=narrative_summary,
        anomalous_uids=anomalous_uids,
        escalation_indicators=escalation_indicators,
        confidence=confidence,
        pattern_detected=pattern_match is not None,
        anomaly_count=len(active_anomalies),
    )


@router.get("/regional_risk")
async def get_regional_risk_heatmap(
    h3_region: str = Query(..., description="H3-7 hexagonal region"),
    lookback_hours: int = Query(
        24, ge=1, le=720, description="Lookback window in hours"
    ),
) -> Dict:
    """
    Get risk heatmap for a region and surrounding cells.

    Returns risk scores for the region and adjacent H3 cells.
    Cells are evaluated concurrently (max 4 parallel) in lightweight mode to
    avoid cascading LLM calls.
    """
    import asyncio

    try:
        # Get neighbors of the region
        neighbors = h3.grid_ring(h3_region, 1)
        all_cells = [h3_region] + list(neighbors)

        # Use a semaphore so at most 4 cells are evaluated concurrently.
        # Each evaluation hits the DB; unbounded parallelism would overwhelm the pool.
        sem = asyncio.Semaphore(_HEATMAP_MAX_CONCURRENCY)

        async def _eval_cell(cell: str) -> tuple:
            async with sem:
                req = EvaluationRequest(
                    h3_region=cell,
                    lookback_hours=lookback_hours,
                    lightweight=True,  # skip LLM per-cell; avoids N×LLM fan-out
                )
                assessment = await evaluate_regional_escalation(req)
                return cell, {
                    "risk_score": assessment.risk_score,
                    "confidence": assessment.confidence,
                    "anomaly_count": assessment.anomaly_count,
                }

        results = await asyncio.gather(
            *[_eval_cell(c) for c in all_cells], return_exceptions=True
        )

        heatmap = {}
        for result in results:
            if isinstance(result, Exception):
                logger.warning("Heatmap cell evaluation failed: %s", result)
                continue
            cell, data = result
            heatmap[cell] = data

        return {
            "center_region": h3_region,
            "lookback_hours": lookback_hours,
            "heatmap": heatmap,
            "max_risk": max([v["risk_score"] for v in heatmap.values()], default=0.0),
        }

    except Exception as e:
        logger.error(f"Error generating heatmap: {e}")
        return {
            "center_region": h3_region,
            "error": str(e),
        }


@router.get("/clausal-chains")
async def get_clausal_chains(
    region: str = Query(...),
    lookback_hours: int = Query(24),
    source: Optional[str] = Query(None),
) -> List[Dict]:
    """
    Fetch clausal chains for a region within a time window.

    Returns serialized ClausalChain objects with full medial clause data.
    The ``region`` parameter is an H3 cell ID; only clauses whose ``geom``
    falls within that hex polygon are returned (PostGIS ST_Within + GIST index).
    """
    try:
        # Build a WKT polygon from the H3 cell boundary so we can push the
        # spatial filter down to PostGIS and use the GIST index.
        try:
            boundary = h3.cell_to_boundary(region)  # list of (lat, lon) tuples
            # PostGIS WKT expects (lon lat) ordering
            coords = [(lon, lat) for lat, lon in boundary]
            # Close the ring by repeating the first vertex
            coords.append(coords[0])
            ring = ", ".join(f"{lon} {lat}" for lon, lat in coords)
            wkt_polygon = f"POLYGON(({ring}))"
        except Exception as h3_err:
            logger.warning(
                "Invalid H3 region '%s': %s – skipping spatial filter", region, h3_err
            )
            wkt_polygon = None

        async with db.pool.acquire() as conn:
            # Query clausal_chains for the region and time window
            where_clauses = [
                "time > now() - ($1 * interval '1 hour')",
            ]
            params: list = [lookback_hours]
            param_idx = 2

            if wkt_polygon:
                where_clauses.append(
                    f"ST_Within(geom, ST_GeomFromText(${param_idx}, 4326))"
                )
                params.append(wkt_polygon)
                param_idx += 1

            if source:
                where_clauses.append(f"source = ${param_idx}")
                params.append(source)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            query = f"""
                SELECT time, uid, source, predicate_type,
                       locative_lat, locative_lon, locative_hae,
                       state_change_reason, adverbial_context, narrative_summary
                FROM clausal_chains
                WHERE {where_sql}
                ORDER BY uid, time ASC
            """

            rows = await conn.fetch(query, *params)

            # Group by UID to form chains
            chains_by_uid: Dict[str, Dict] = {}
            for row in rows:
                uid = row["uid"]
                if uid not in chains_by_uid:
                    chains_by_uid[uid] = {
                        "uid": uid,
                        "source": row["source"],
                        "predicate_type": row["predicate_type"],
                        "narrative_summary": row.get("narrative_summary"),
                        "clauses": [],
                    }

                clause = {
                    "time": row["time"].isoformat()
                    if hasattr(row["time"], "isoformat")
                    else str(row["time"]),
                    "locative_lat": row["locative_lat"],
                    "locative_lon": row["locative_lon"],
                    "locative_hae": row["locative_hae"],
                    "state_change_reason": row["state_change_reason"],
                    "adverbial_context": dict(row["adverbial_context"])
                    if row["adverbial_context"]
                    else {},
                }
                chains_by_uid[uid]["clauses"].append(clause)

            return list(chains_by_uid.values())

    except Exception as e:
        logger.error(f"Error fetching clausal chains: {e}")
        return []


@router.get("/health")
async def health_check() -> Dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy", "service": "ai-router"}


# ---------------------------------------------------------------------------
# Phase 4 — Domain Agent Endpoints
# ---------------------------------------------------------------------------

class DomainAnalysisRequest(BaseModel):
    """Shared request body for all three domain agents."""
    h3_region: str
    lookback_hours: int = 24


class DomainAnalysisResponse(BaseModel):
    domain: str
    h3_region: str
    narrative: str
    risk_score: float
    indicators: List[str]
    context_snapshot: Dict


@router.post("/analyze/air")
async def analyze_air_domain(request: DomainAnalysisRequest) -> DomainAnalysisResponse:
    """
    Air Intelligence Officer persona.

    Fuses ADS-B telemetry (squawk codes, altitude, course), NWS wind/severe-weather
    alerts, and GDELT air-domain events to produce an air-domain risk assessment.
    """
    indicators: List[str] = []
    context: Dict = {"domain": "air", "h3_region": request.h3_region}

    wkt_polygon = _h3_cell_to_wkt(request.h3_region)

    # ADS-B snapshot from clausal_chains
    adsb_rows: List[Dict] = []
    async with db.pool.acquire() as conn:
        if wkt_polygon:
            rows = await conn.fetch(
                """
                SELECT uid, predicate_type, locative_lat, locative_lon, locative_hae,
                       adverbial_context, time
                FROM clausal_chains
                WHERE source = 'TAK_ADSB'
                  AND time > now() - ($1 * interval '1 hour')
                  AND ST_Within(geom, ST_GeomFromText($2, 4326))
                ORDER BY time DESC LIMIT 50
                """,
                request.lookback_hours,
                wkt_polygon,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT uid, predicate_type, locative_lat, locative_lon, locative_hae,
                       adverbial_context, time
                FROM clausal_chains
                WHERE source = 'TAK_ADSB'
                  AND time > now() - ($1 * interval '1 hour')
                ORDER BY time DESC LIMIT 50
                """,
                request.lookback_hours,
            )
        adsb_rows = [dict(r) for r in rows]

    # Emergency squawk detection
    emergency_squawks = [
        r for r in adsb_rows
        if (r.get("adverbial_context") or {}).get("squawk") in ("7700", "7600", "7500")
    ]
    if emergency_squawks:
        indicators.append(f"Emergency squawk codes active: {len(emergency_squawks)} aircraft")

    # Holding pattern detection (repeated heading reversals)
    uid_counts: Dict[str, int] = {}
    for r in adsb_rows:
        uid_counts[r["uid"]] = uid_counts.get(r["uid"], 0) + 1
    high_dwell = [uid for uid, cnt in uid_counts.items() if cnt >= 5]
    if high_dwell:
        indicators.append(f"Possible holding patterns: {len(high_dwell)} UIDs with ≥5 observations")

    # NWS severe weather context
    nws_summary: Optional[str] = None
    if db.redis_client:
        nws_raw = await db.redis_client.get("nws:alerts:summary")
        if nws_raw:
            import json as _j
            nws_data = _j.loads(nws_raw)
            context["nws_alerts"] = nws_data
            if nws_data.get("severe_count", 0) > 0:
                nws_summary = f"{nws_data['severe_count']} severe NWS weather alerts active nationally"
                indicators.append(nws_summary)

    # Space weather (GPS/comms impact)
    if db.redis_client:
        kp_raw = await db.redis_client.get("space_weather:kp_current")
        if kp_raw:
            import json as _j2
            kp_data = _j2.loads(kp_raw)
            context["kp_index"] = kp_data.get("kp")
            if kp_data.get("kp", 0) >= 5:
                indicators.append(f"GPS degradation risk: Kp={kp_data['kp']} ({kp_data.get('storm_level','?')})")

    entity_count = len(set(r["uid"] for r in adsb_rows))
    risk_score = min(1.0, (len(emergency_squawks) * 0.4 + len(high_dwell) * 0.1 + entity_count * 0.005))

    context["adsb_entity_count"] = entity_count
    context["emergency_squawk_count"] = len(emergency_squawks)

    # Build narrative via unified AIService (Air Intelligence Officer persona)
    signals_text = "\n".join(f"- {i}" for i in indicators) if indicators else "- No anomalies detected"
    user_prompt = (
        f"Air domain assessment for H3 region {request.h3_region}:\n"
        f"- {entity_count} ADS-B tracks in {request.lookback_hours}h window\n"
        f"- Kp index: {context.get('kp_index', 'N/A')}\n"
        f"- NWS alerts: {context.get('nws_alerts', {})}\n\n"
        f"HEURISTIC SIGNALS:\n{signals_text}"
    )
    persona = ai_service.get_persona(mode="tactical")
    logger.info("🧠 [UNIFIED-BRAIN] Air domain analysis for %s", request.h3_region)
    try:
        narrative = await ai_service.generate_static(
            system_prompt=persona["sys"] + "\n" + persona["inst"],
            user_prompt=user_prompt,
        )
    except Exception as exc:
        logger.warning("Air domain LLM failed, using heuristic narrative: %s", exc)
        narrative = (
            f"Air domain: {entity_count} ADS-B tracks in {request.lookback_hours}h. "
            + ("; ".join(indicators) if indicators else "No anomalies detected.")
        )

    return DomainAnalysisResponse(
        domain="air",
        h3_region=request.h3_region,
        narrative=narrative,
        risk_score=round(risk_score, 3),
        indicators=indicators,
        context_snapshot=context,
    )


@router.post("/analyze/sea")
async def analyze_sea_domain(request: DomainAnalysisRequest) -> DomainAnalysisResponse:
    """
    Maritime Domain Awareness (MDA) Specialist persona.

    Fuses AIS vessel telemetry, NDBC wave/wind observations, IODA internet
    outage correlation with submarine cable landing points, and GDELT maritime
    events to produce a sea-domain risk assessment.
    """
    indicators: List[str] = []
    context: Dict = {"domain": "sea", "h3_region": request.h3_region}

    wkt_polygon = _h3_cell_to_wkt(request.h3_region)

    # AIS snapshot
    ais_rows: List[Dict] = []
    async with db.pool.acquire() as conn:
        if wkt_polygon:
            rows = await conn.fetch(
                """
                SELECT uid, predicate_type, locative_lat, locative_lon,
                       adverbial_context, time
                FROM clausal_chains
                WHERE source = 'TAK_AIS'
                  AND time > now() - ($1 * interval '1 hour')
                  AND ST_Within(geom, ST_GeomFromText($2, 4326))
                ORDER BY time DESC LIMIT 50
                """,
                request.lookback_hours,
                wkt_polygon,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT uid, predicate_type, locative_lat, locative_lon,
                       adverbial_context, time
                FROM clausal_chains
                WHERE source = 'TAK_AIS'
                  AND time > now() - ($1 * interval '1 hour')
                ORDER BY time DESC LIMIT 50
                """,
                request.lookback_hours,
            )
        ais_rows = [dict(r) for r in rows]

    entity_count = len(set(r["uid"] for r in ais_rows))

    # NDBC wave height context
    if db.redis_client:
        ndbc_raw = await db.redis_client.get("ndbc:latest_obs")
        if ndbc_raw:
            import json as _j
            ndbc_data = _j.loads(ndbc_raw)
            wave_heights = [
                f["properties"]["wvht_m"]
                for f in ndbc_data.get("features", [])
                if f.get("properties", {}).get("wvht_m") is not None
            ]
            if wave_heights:
                max_wvht = max(wave_heights)
                context["max_wave_height_m"] = max_wvht
                if max_wvht >= 4.0:
                    indicators.append(f"High sea state: max wave height {max_wvht:.1f}m (NDBC)")

    # IODA ↔ cable landing correlation
    if db.redis_client:
        outages_raw = await db.redis_client.get("infra:outages")
        if outages_raw:
            import json as _jj
            outages_data = _jj.loads(outages_raw)
            correlated = [
                f for f in outages_data.get("features", [])
                if f.get("properties", {}).get("nearby_cable_landings")
            ]
            if correlated:
                indicators.append(
                    f"Internet outages near submarine cable landings: {len(correlated)} regions affected"
                )
                context["cable_correlated_outages"] = len(correlated)

    # Dark vessel detection (vessels with very infrequent AIS updates)
    uid_last: Dict[str, int] = {}
    for r in ais_rows:
        uid_last[r["uid"]] = uid_last.get(r["uid"], 0) + 1
    sparse_vessels = [uid for uid, cnt in uid_last.items() if cnt == 1]
    if len(sparse_vessels) > 3:
        indicators.append(f"Possible AIS dark vessels: {len(sparse_vessels)} with single observation")

    risk_score = min(1.0, len(indicators) * 0.2 + entity_count * 0.005)
    context["ais_entity_count"] = entity_count

    # Build narrative via unified AIService (MDA Specialist persona)
    signals_text = "\n".join(f"- {i}" for i in indicators) if indicators else "- No anomalies detected"
    user_prompt = (
        f"Maritime domain assessment for H3 region {request.h3_region}:\n"
        f"- {entity_count} AIS tracks in {request.lookback_hours}h window\n"
        f"- Max wave height: {context.get('max_wave_height_m', 'N/A')}m (NDBC)\n"
        f"- Cable-correlated outages: {context.get('cable_correlated_outages', 0)}\n\n"
        f"HEURISTIC SIGNALS:\n{signals_text}"
    )
    persona = ai_service.get_persona(mode="tactical")
    logger.info("🧠 [UNIFIED-BRAIN] Sea domain analysis for %s", request.h3_region)
    try:
        narrative = await ai_service.generate_static(
            system_prompt=persona["sys"] + "\n" + persona["inst"],
            user_prompt=user_prompt,
        )
    except Exception as exc:
        logger.warning("Sea domain LLM failed, using heuristic narrative: %s", exc)
        narrative = (
            f"Sea domain: {entity_count} AIS tracks in {request.lookback_hours}h. "
            + ("; ".join(indicators) if indicators else "No anomalies detected.")
        )

    return DomainAnalysisResponse(
        domain="sea",
        h3_region=request.h3_region,
        narrative=narrative,
        risk_score=round(risk_score, 3),
        indicators=indicators,
        context_snapshot=context,
    )


@router.post("/analyze/orbital")
async def analyze_orbital_domain(request: DomainAnalysisRequest) -> DomainAnalysisResponse:
    """
    Space Weather / Orbital Analyst persona.

    Fuses Kp-index, NOAA R/S/G scale levels, SatNOGS signal events, and
    orbital track data to produce an orbital/space-weather domain assessment.
    """
    import json as _j
    indicators: List[str] = []
    context: Dict = {"domain": "orbital", "h3_region": request.h3_region}

    # Space weather context from Redis
    kp_val: Optional[float] = None
    storm_level: Optional[str] = None
    if db.redis_client:
        kp_raw = await db.redis_client.get("space_weather:kp_current")
        if kp_raw:
            kp_data = _j.loads(kp_raw)
            kp_val = kp_data.get("kp")
            storm_level = kp_data.get("storm_level")
            context["kp_index"] = kp_val
            context["storm_level"] = storm_level
            if kp_val is not None and kp_val >= 6:
                indicators.append(f"Significant geomagnetic storm: Kp={kp_val} ({storm_level})")
            elif kp_val is not None and kp_val >= 4:
                indicators.append(f"Elevated Kp index: {kp_val} ({storm_level})")

        scales_raw = await db.redis_client.get("space_weather:noaa_scales")
        if scales_raw:
            scales_data = _j.loads(scales_raw)
            current_scales = scales_data.get("0", {})
            r_scale = current_scales.get("R", {}).get("Scale", "R0")
            g_scale = current_scales.get("G", {}).get("Scale", "G0")
            s_scale = current_scales.get("S", {}).get("Scale", "S0")
            context["noaa_scales"] = {"R": r_scale, "G": g_scale, "S": s_scale}
            r_lvl = int(r_scale[1:]) if len(r_scale) > 1 and r_scale[1:].isdigit() else 0
            g_lvl = int(g_scale[1:]) if len(g_scale) > 1 and g_scale[1:].isdigit() else 0
            s_lvl = int(s_scale[1:]) if len(s_scale) > 1 and s_scale[1:].isdigit() else 0
            if r_lvl >= 3:
                indicators.append(f"Radio Blackout {r_scale}: HF comms degraded")
            if g_lvl >= 3:
                indicators.append(f"Geomagnetic Storm {g_scale}: satellite drag/orientation risk")
            if s_lvl >= 2:
                indicators.append(f"Solar Energetic Particle event {s_scale}: radiation hazard")

        suppression_raw = await db.redis_client.get("space_weather:suppress_signal_loss")
        if suppression_raw:
            sup_data = _j.loads(suppression_raw)
            context["signal_loss_suppression"] = sup_data
            if sup_data.get("active"):
                indicators.append(f"Signal-loss suppression active: {sup_data.get('reason', '')}")

    # SatNOGS signal loss events
    signal_count = 0
    async with db.pool.acquire() as conn:
        signal_rows = await conn.fetch(
            """
            SELECT norad_id, ground_station_name, signal_strength, time
            FROM satnogs_signal_events
            WHERE time > now() - ($1 * interval '1 hour')
              AND signal_strength < -10.0
            ORDER BY signal_strength ASC LIMIT 10
            """,
            request.lookback_hours,
        )
        signal_count = len(signal_rows)
        if signal_count > 0 and not context.get("signal_loss_suppression", {}).get("active"):
            indicators.append(f"Satellite signal loss events: {signal_count} observations below -10 dBm")
            context["signal_loss_count"] = signal_count

    kp_risk = min(1.0, (kp_val or 0) / 9.0)
    scale_risk = 0.3 if any("Radio Blackout" in i or "Geomagnetic Storm" in i for i in indicators) else 0.0
    signal_risk = min(0.4, signal_count * 0.04) if not context.get("signal_loss_suppression", {}).get("active") else 0.0
    risk_score = min(1.0, kp_risk * 0.5 + scale_risk + signal_risk)

    # Build narrative via unified AIService (Space Weather / Orbital Analyst persona)
    signals_text = "\n".join(f"- {i}" for i in indicators) if indicators else "- Nominal conditions"
    user_prompt = (
        f"Orbital / space-weather assessment for H3 region {request.h3_region}:\n"
        f"- Kp index: {kp_val or 'N/A'} ({storm_level or 'unknown'})\n"
        f"- NOAA scales: {context.get('noaa_scales', {})}\n"
        f"- SatNOGS signal-loss events: {signal_count}\n\n"
        f"HEURISTIC SIGNALS:\n{signals_text}"
    )
    persona = ai_service.get_persona(mode="tactical")
    logger.info("🧠 [UNIFIED-BRAIN] Orbital domain analysis for %s", request.h3_region)
    try:
        narrative = await ai_service.generate_static(
            system_prompt=persona["sys"] + "\n" + persona["inst"],
            user_prompt=user_prompt,
        )
    except Exception as exc:
        logger.warning("Orbital domain LLM failed, using heuristic narrative: %s", exc)
        narrative = (
            f"Orbital/space-weather: Kp={kp_val or 'N/A'} ({storm_level or 'unknown'}). "
            + ("; ".join(indicators) if indicators else "Nominal space weather conditions.")
        )

    return DomainAnalysisResponse(
        domain="orbital",
        h3_region=request.h3_region,
        narrative=narrative,
        risk_score=round(risk_score, 3),
        indicators=indicators,
        context_snapshot=context,
    )
