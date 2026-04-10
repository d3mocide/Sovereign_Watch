"""
Sequence Evaluation Engine: Routes aligned clausal chains through AIService for narrative analysis.
Implements zero-shot prompting for topological narrative analysis and escalation detection.
"""

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from services.ai_service import ai_service
from services.semantic_cache import get_semantic_cache

logger = logging.getLogger(__name__)


@dataclass
class RiskAssessment:
    """Output from sequence evaluation."""

    h3_region_id: str
    risk_score: float  # 0.0 - 1.0
    narrative_summary: str
    anomalous_uids: List[str]
    escalation_indicators: List[str]
    confidence: float
    raw_response: Optional[str] = None


class SequenceEvaluationEngine:
    """Routes clausal chain sequences through AIService for AI-driven analysis."""

    def __init__(self, litellm_config: Optional[Dict[str, Any]] = None):
        """
        Initialize the engine.
        Actual model configuration is managed by AIService; litellm_config is accepted
        for backward compatibility but ignored.
        """
        pass

    async def evaluate_escalation(
        self,
        h3_region: str,
        gdelt_summary: str,
        tak_summary: str,
        anomalous_uids: List[str],
        behavioral_signals: List[str] = None,
        heuristic_risk_score: float = 0.0,
        escalation_indicators: List[str] | None = None,
        gdelt_linkage_notes: str | None = None,
        mode: str = "tactical",
        is_sitrep: bool = True,
    ) -> RiskAssessment:
        """
        Evaluate escalation risk for a region using AIService.

        Checks the RedisVL semantic cache (threshold 0.94) before calling the LLM,
        and stores the response for future near-identical prompts.
        """
        user_prompt = self._build_context_window(
            h3_region,
            gdelt_summary,
            tak_summary,
            anomalous_uids,
            behavioral_signals,
            heuristic_risk_score,
            escalation_indicators,
            gdelt_linkage_notes,
            mode,
        )

        try:
            persona = ai_service.get_persona(
                mode=mode,
                context={"is_sitrep": is_sitrep},
            )

            # 2. Inject the MUST-BE-JSON requirement for structured parsing
            json_requirement = (
                "\n\nFINAL OUTPUT REQUIREMENT: You MUST return valid JSON with these fields: "
                '{"risk_score": <float>, "narrative_summary": "<use SITREP headers here>", '
                '"anomalous_uids": [], "escalation_indicators": [], "confidence": <float>}. '
                "Ensure narrative_summary is structured with the requested ### headers."
            )

            system_instruction = f"{persona['sys']}\n{persona['inst']}{json_requirement}"

            # 3. Semantic cache look-aside (keyed on the full user prompt)
            redis_url = os.getenv("REDIS_URL", "redis://sovereign-redis:6379")
            sem_cache = await get_semantic_cache(redis_url)
            cached = await sem_cache.check(user_prompt)
            if cached is not None:
                logger.info(
                    "SemanticCache HIT — skipping LLM call for region %s (mode=%s)",
                    h3_region,
                    mode,
                )
                risk_assessment = self._parse_response(cached, h3_region)
                risk_assessment.raw_response = cached
                return self._apply_consistency_guard(
                    risk_assessment,
                    heuristic_risk_score=heuristic_risk_score,
                    escalation_indicators=escalation_indicators or [],
                    gdelt_linkage_notes=gdelt_linkage_notes,
                )

            # 4. Route through unified AIService
            response = await ai_service.generate_static(
                system_prompt=system_instruction,
                user_prompt=user_prompt,
            )

            # 5. Store in semantic cache for future near-identical requests
            await sem_cache.store(user_prompt, response)

            risk_assessment = self._parse_response(response, h3_region)
            risk_assessment.raw_response = response
            return self._apply_consistency_guard(
                risk_assessment,
                heuristic_risk_score=heuristic_risk_score,
                escalation_indicators=escalation_indicators or [],
                gdelt_linkage_notes=gdelt_linkage_notes,
            )

        except Exception:
            logger.exception(
                "Error in sequence evaluation for region %s (mode=%s)",
                h3_region,
                mode,
            )
            return RiskAssessment(
                h3_region_id=h3_region,
                risk_score=0.0,
                narrative_summary="",
                anomalous_uids=anomalous_uids,
                escalation_indicators=[],
                confidence=0.0,
            )

    def _build_context_window(
        self,
        h3_region: str,
        gdelt_summary: str,
        tak_summary: str,
        anomalous_uids: List[str],
        behavioral_signals: List[str] = None,
        heuristic_risk_score: float = 0.0,
        escalation_indicators: List[str] | None = None,
        gdelt_linkage_notes: str | None = None,
        mode: str = "tactical",
    ) -> str:
        """Build the user prompt with scaled contextual data."""
        signals_text = "None detected"
        if behavioral_signals:
            signals_text = "\n".join([f"- {s}" for s in behavioral_signals])

        indicators_text = "None"
        if escalation_indicators:
            indicators_text = "\n".join([f"- {item}" for item in escalation_indicators])

        gdelt_linkage_text = gdelt_linkage_notes or "No explicit linked-external GDELT notes"

        prompt = f"""Analyze the following multi-INT data for regional risk:

REGION: H3 Cell {h3_region}
TARGET OBJECTIVE / VIEW: {mode.upper()}

GEOPOLITICAL CONTEXT (GDELT):
{gdelt_summary if gdelt_summary else "No recent GDELT events in region"}

TACTICAL TELEMETRY (TAK):
{tak_summary if tak_summary else "No recent TAK activity in region"}

HEURISTIC BEHAVIORAL SIGNALS (GROUND TRUTH):
{signals_text}

PRECOMPUTED HEURISTICS (BINDING EVIDENCE):
- Heuristic regional risk score: {heuristic_risk_score:.2f}
- Escalation indicators:
{indicators_text}
- GDELT linkage notes: {gdelt_linkage_text}

ANOMALOUS ENTITIES:
{", ".join(anomalous_uids) if anomalous_uids else "None identified"}

Based on this data, synthesize a regional risk assessment. Connect the tactical ground-truth signals to the geopolitical context where relevant.

Decision rules:
- Treat the precomputed heuristics as binding evidence, not optional hints.
- If the heuristic regional risk score is 0.25 or higher, do not conclude that there is no significant escalation.
- If escalation indicators are present, narrative_summary must explain them directly.
- If GDELT linkage notes show state-actor or maritime chokepoint pressure, reflect that in the assessment when relevant.
- Resolve contradictions explicitly instead of giving a generic neutral conclusion."""
        return prompt

    def _apply_consistency_guard(
        self,
        assessment: RiskAssessment,
        *,
        heuristic_risk_score: float,
        escalation_indicators: List[str],
        gdelt_linkage_notes: str | None,
    ) -> RiskAssessment:
        narrative = (assessment.narrative_summary or "").strip()
        lowered = narrative.lower()
        has_contradiction = (
            heuristic_risk_score >= 0.25 or bool(escalation_indicators)
        ) and "no significant escalation detected" in lowered

        if has_contradiction or not narrative:
            drivers = "; ".join(escalation_indicators[:3]) if escalation_indicators else "localized multi-INT pressure"
            linkage = (
                f" Linked GDELT context: {gdelt_linkage_notes}."
                if gdelt_linkage_notes
                and gdelt_linkage_notes
                != "0 in-AOT, 0 state-actor/border, 0 cable-infra, 0 maritime-chokepoint"
                else ""
            )
            assessment.narrative_summary = (
                f"Heuristic signals indicate elevated regional pressure. Key drivers: {drivers}.{linkage}"
            )
        return assessment

    def _parse_response(self, response_text: str, h3_region: str) -> RiskAssessment:
        """Parse LLM response into RiskAssessment."""
        try:
            json_str = response_text
            if "```json" in response_text:
                json_str = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                json_str = response_text.split("```")[1].split("```")[0]

            data = json.loads(json_str)

            return RiskAssessment(
                h3_region_id=h3_region,
                risk_score=float(data.get("risk_score", 0.0)),
                narrative_summary=data.get("narrative_summary", ""),
                anomalous_uids=data.get("anomalous_uids", []),
                escalation_indicators=data.get("escalation_indicators", []),
                confidence=float(data.get("confidence", 0.5)),
            )
        except Exception as e:
            logger.warning(
                "Error parsing LLM response for region %s: %s | raw=%r",
                h3_region,
                e,
                response_text[:300],
            )
            return RiskAssessment(
                h3_region_id=h3_region,
                risk_score=0.5,
                narrative_summary=response_text[:200],
                anomalous_uids=[],
                escalation_indicators=[],
                confidence=0.3,
            )

    def scale_tak_data(self, tak_clauses: List[Dict], target_count: int = 5) -> str:
        """Scale TAK data to prevent token exhaustion."""
        if not tak_clauses:
            return ""

        uid_groups: Dict[str, List[Dict]] = {}
        for clause in tak_clauses:
            uid = clause.get("uid", "unknown")
            if uid not in uid_groups:
                uid_groups[uid] = []
            uid_groups[uid].append(clause)

        summaries = []
        for uid, clauses in list(uid_groups.items())[:target_count]:
            latest = clauses[-1]
            state_changes = [c.get("state_change_reason", "UNKNOWN") for c in clauses]
            lat = latest.get("locative_lat")
            lon = latest.get("locative_lon")
            summary = (
                f"{uid}: {len(clauses)} state-changes ({', '.join(set(state_changes))}) "
                f"at {abs(lat):.2f}{'N' if lat >= 0 else 'S'}, "
                f"{abs(lon):.2f}{'E' if lon >= 0 else 'W'}"
            )
            summaries.append(summary)

        return "\n".join(summaries)

    def scale_gdelt_data(self, gdelt_clauses: List[Dict], target_count: int = 5) -> str:
        """Scale GDELT data to prevent token exhaustion."""
        if not gdelt_clauses:
            return ""

        code_groups: Dict[str, List[Dict]] = {}
        for clause in gdelt_clauses:
            code = clause.get("predicate_type", "UNKNOWN")
            if code not in code_groups:
                code_groups[code] = []
            code_groups[code].append(clause)

        summaries = []
        for code, clauses in list(code_groups.items())[:target_count]:
            summary = f"{code}: {len(clauses)} events, latest: {clauses[-1].get('narrative', 'N/A')[:100]}"
            summaries.append(summary)

        return "\n".join(summaries)
