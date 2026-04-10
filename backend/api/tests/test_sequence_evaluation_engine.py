from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.sequence_evaluation_engine import RiskAssessment, SequenceEvaluationEngine


def test_build_context_window_includes_binding_heuristics() -> None:
    engine = SequenceEvaluationEngine()

    prompt = engine._build_context_window(
        h3_region="8728f2ba8ffffff",
        gdelt_summary="Conflict reporting near a chokepoint.",
        tak_summary="Multiple units converging.",
        anomalous_uids=["A1", "B2"],
        behavioral_signals=["Rendezvous detected"],
        heuristic_risk_score=0.41,
        escalation_indicators=["GDELT conflict intensity elevated"],
        gdelt_linkage_notes="2 in-AOT, 4 maritime-chokepoint",
        mode="tactical",
    )

    assert "Treat the precomputed heuristics as binding evidence" in prompt
    assert "Heuristic regional risk score: 0.41" in prompt
    assert "GDELT conflict intensity elevated" in prompt
    assert "2 in-AOT, 4 maritime-chokepoint" in prompt
    assert "TARGET OBJECTIVE / VIEW: TACTICAL" in prompt


def test_apply_consistency_guard_rewrites_contradictory_summary() -> None:
    engine = SequenceEvaluationEngine()
    assessment = RiskAssessment(
        h3_region_id="8728f2ba8ffffff",
        risk_score=0.18,
        narrative_summary="No significant escalation detected despite noisy inputs.",
        anomalous_uids=[],
        escalation_indicators=[],
        confidence=0.7,
    )

    guarded = engine._apply_consistency_guard(
        assessment,
        heuristic_risk_score=0.43,
        escalation_indicators=["GDELT conflict intensity elevated", "Entity clustering detected"],
        gdelt_linkage_notes="1 in-AOT, 3 maritime-chokepoint",
    )

    assert "Heuristic signals indicate elevated regional pressure" in guarded.narrative_summary
    assert "GDELT conflict intensity elevated" in guarded.narrative_summary
    assert "Linked GDELT context: 1 in-AOT, 3 maritime-chokepoint." in guarded.narrative_summary