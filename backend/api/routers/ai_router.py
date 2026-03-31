"""
AI Router: Orchestrates multi-INT fusion for autonomous threat detection.
Implements spatial-temporal alignment, sequence evaluation, and escalation detection.
"""

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from services.escalation_detector import EscalationDetector
from services.sequence_evaluation_engine import (
    RiskAssessment,
    SequenceEvaluationEngine,
)
from services.spatial_temporal_alignment import SpatialTemporalAlignment
from core.database import get_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai_router", tags=["AI Router"])


class EvaluationRequest(BaseModel):
    """Request for regional escalation evaluation."""

    h3_region: str  # H3-7 hexagonal cell
    lookback_hours: int = 24
    include_gdelt: bool = True
    include_tak: bool = True


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


@router.post("/evaluate")
async def evaluate_regional_escalation(request: EvaluationRequest) -> RiskAssessmentResponse:
    """
    Evaluate escalation risk for a specific H3 region.

    Queries clausal_chains table for both TAK and GDELT events,
    applies spatial-temporal alignment, detects patterns, and routes through LLM.

    Args:
        request: EvaluationRequest with region and parameters

    Returns:
        RiskAssessmentResponse with structured risk evaluation
    """
    logger.info(f"Evaluating region {request.h3_region} with {request.lookback_hours}h lookback")

    # Initialize services
    alignment_engine = SpatialTemporalAlignment()
    escalation_detector = EscalationDetector()

    # Fetch clausal chains from database
    pool = get_pool()
    async with pool.acquire() as conn:
        # Query clausal_chains for TAK and GDELT data
        window = f"{request.lookback_hours} hours"

        # GDELT events
        gdelt_events = []
        if request.include_gdelt:
            gdelt_query = """
                SELECT time, uid, source, predicate_type, locative_lat, locative_lon,
                       state_change_reason, narrative_summary, adverbial_context
                FROM clausal_chains
                WHERE source = 'GDELT'
                  AND time > now() - interval %s
                ORDER BY time DESC
            """
            rows = await conn.fetch(gdelt_query, window)
            gdelt_events = [dict(row) for row in rows]

        # TAK events
        tak_events = []
        if request.include_tak:
            tak_query = """
                SELECT time, uid, source, predicate_type, locative_lat, locative_lon,
                       state_change_reason, narrative_summary, adverbial_context
                FROM clausal_chains
                WHERE source IN ('TAK_ADSB', 'TAK_AIS')
                  AND time > now() - interval %s
                ORDER BY time DESC
            """
            rows = await conn.fetch(tak_query, window)
            tak_events = [dict(row) for row in rows]

    # Align clauses spatially/temporally
    aligned = await alignment_engine.align_clauses(
        h3_region=request.h3_region,
        clausal_chains=tak_events,
        gdelt_events=gdelt_events,
        lookback_window=f"{request.lookback_hours}h",
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
            "adverbial_context": {"course": 0.0},  # Placeholder
        }
        for clause in aligned.tak_clauses
    ]

    clustering_anomaly = escalation_detector.detect_anomaly_concentration(
        tak_dicts, request.h3_region
    )
    directional_anomalies = escalation_detector.detect_directional_anomalies(tak_dicts)
    emergency_anomalies = escalation_detector.detect_emergency_transponders(tak_dicts)

    all_anomalies = [clustering_anomaly] + directional_anomalies + emergency_anomalies
    anomaly_score = max([a.score for a in all_anomalies], default=0.0)
    anomalous_uids = []
    for anomaly in all_anomalies:
        anomalous_uids.extend(anomaly.affected_uids)
    anomalous_uids = list(set(anomalous_uids))

    # Compute composite risk score
    risk_score = escalation_detector.compute_risk_score(
        pattern_confidence=pattern_confidence,
        anomaly_score=anomaly_score,
        alignment_score=aligned.alignment_score,
        anomaly_count=len(all_anomalies),
    )

    # Build narrative summaries for LLM
    gdelt_summary = "\n".join(
        [
            f"{c.predicate_type}: {c.narrative or 'N/A'}"
            for c in aligned.gdelt_clauses[:5]
        ]
    )
    tak_summary = "\n".join(
        [
            f"{c.uid} ({c.source}): {c.predicate_type}"
            for c in aligned.tak_clauses[:5]
        ]
    )

    # Initialize LLM-based sequence evaluation if risk is elevated
    narrative_summary = "No significant escalation detected"
    confidence = 0.5

    if risk_score > 0.3:
        try:
            # Initialize LiteLLM config (minimal for now)
            litellm_config = {
                "api_key": "",
                "api_base": "http://localhost:11434",  # Local Ollama
                "model_name": "llama3",
            }
            evaluation_engine = SequenceEvaluationEngine(litellm_config)

            # Call LLM for detailed analysis
            assessment: RiskAssessment = await evaluation_engine.evaluate_escalation(
                h3_region=request.h3_region,
                gdelt_summary=gdelt_summary,
                tak_summary=tak_summary,
                anomalous_uids=anomalous_uids,
            )

            narrative_summary = assessment.narrative_summary
            confidence = assessment.confidence
            # Risk score from LLM can override if confidence is high
            if confidence > 0.7:
                risk_score = assessment.risk_score

        except Exception as e:
            logger.warning(f"LLM evaluation failed, using heuristic scoring: {e}")

    # Detect escalation indicators
    escalation_indicators = []
    if pattern_match:
        escalation_indicators.append("GDELT pattern matched")
    if clustering_anomaly.score > 0.5:
        escalation_indicators.append("Entity clustering detected")
    if directional_anomalies:
        escalation_indicators.append("Directional anomalies detected")
    if emergency_anomalies:
        escalation_indicators.append("Emergency transponders activated")

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
        anomaly_count=len(all_anomalies),
    )


@router.get("/regional_risk")
async def get_regional_risk_heatmap(
    h3_region: str = Query(..., description="H3-7 hexagonal region"),
    lookback_hours: int = Query(24, ge=1, le=720, description="Lookback window in hours"),
) -> Dict:
    """
    Get risk heatmap for a region and surrounding cells.

    Returns risk scores for the region and adjacent H3 cells.
    """
    try:
        import h3

        # Get neighbors of the region
        neighbors = h3.grid_ring(h3_region, 1)
        all_cells = [h3_region] + neighbors

        # Evaluate each cell
        heatmap = {}
        for cell in all_cells:
            request = EvaluationRequest(
                h3_region=cell,
                lookback_hours=lookback_hours,
            )
            assessment = await evaluate_regional_escalation(request)
            heatmap[cell] = {
                "risk_score": assessment.risk_score,
                "confidence": assessment.confidence,
                "anomaly_count": assessment.anomaly_count,
            }

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


@router.post("/clausal-chains")
async def get_clausal_chains(
    region: str = Query(...),
    lookback_hours: int = Query(24),
    source: Optional[str] = Query(None),
) -> List[Dict]:
    """
    Fetch clausal chains for a region within a time window.

    Returns serialized ClausalChain objects with full medial clause data.
    """
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            # Query clausal_chains for the region and time window
            where_clauses = [
                "time > now() - interval %s",
            ]
            params = [f"{lookback_hours} hours"]

            if source:
                where_clauses.append("source = %s")
                params.append(source)

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
                    "time": row["time"].isoformat() if hasattr(row["time"], "isoformat") else str(row["time"]),
                    "locative_lat": row["locative_lat"],
                    "locative_lon": row["locative_lon"],
                    "locative_hae": row["locative_hae"],
                    "state_change_reason": row["state_change_reason"],
                    "adverbial_context": dict(row["adverbial_context"]) if row["adverbial_context"] else {},
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
