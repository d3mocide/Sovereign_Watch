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
        is_sitrep: bool = True,
    ) -> RiskAssessment:
        """
        Evaluate escalation risk for a region using AIService.

        Checks the RedisVL semantic cache (threshold 0.94) before calling the LLM,
        and stores the response for future near-identical prompts.
        """
        user_prompt = self._build_context_window(
            h3_region, gdelt_summary, tak_summary, anomalous_uids, behavioral_signals
        )

        try:
            # 1. Fetch official persona with markdown rules
            persona = ai_service.get_persona(mode="osint", is_sitrep=is_sitrep)

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
                logger.info("SemanticCache HIT — skipping LLM call for region %s", h3_region)
                risk_assessment = self._parse_response(cached, h3_region)
                risk_assessment.raw_response = cached
                return risk_assessment

            # 4. Route through unified AIService
            response = await ai_service.generate_static(
                system_prompt=system_instruction,
                user_prompt=user_prompt,
            )

            # 5. Store in semantic cache for future near-identical requests
            await sem_cache.store(user_prompt, response)

            risk_assessment = self._parse_response(response, h3_region)
            risk_assessment.raw_response = response
            return risk_assessment

        except Exception as e:
            logger.error(f"Error in sequence evaluation: {e}")
            return RiskAssessment(
                h3_region_id=h3_region,
                risk_score=0.0,
                narrative_summary="Evaluation error",
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
    ) -> str:
        """Build the user prompt with scaled contextual data."""
        signals_text = "None detected"
        if behavioral_signals:
            signals_text = "\n".join([f"- {s}" for s in behavioral_signals])

        prompt = f"""Analyze the following multi-INT data for regional risk:

REGION: H3 Cell {h3_region}

GEOPOLITICAL CONTEXT (GDELT):
{gdelt_summary if gdelt_summary else "No recent GDELT events in region"}

TACTICAL TELEMETRY (TAK):
{tak_summary if tak_summary else "No recent TAK activity in region"}

HEURISTIC BEHAVIORAL SIGNALS (GROUND TRUTH):
{signals_text}

ANOMALOUS ENTITIES:
{", ".join(anomalous_uids) if anomalous_uids else "None identified"}

Based on this data, synthesize a regional risk assessment. Connect the tactical ground-truth signals to the geopolitical context where relevant."""
        return prompt

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
            logger.warning(f"Error parsing LLM response: {e}")
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
