import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from services.ai_service import ai_service

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
        Note: actual model configuration is now managed by AIService.
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
        """
        # Build user prompt with context
        user_prompt = self._build_context_window(
            h3_region, gdelt_summary, tak_summary, anomalous_uids, behavioral_signals
        )

        try:
            # 1. Fetch official persona with markdown rules
            persona = ai_service.get_persona(mode="osint", is_sitrep=is_sitrep)
            
            # 2. Inject the MUST-BE-JSON requirement for the engine
            json_requirement = (
                "\n\nFINAL OUTPUT REQUIREMENT: You MUST return valid JSON with these fields: "
                '{"risk_score": <float>, "narrative_summary": "<use SITREP headers here>", '
                '"anomalous_uids": [], "escalation_indicators": [], "confidence": <float>}. '
                "Ensure narrative_summary is structured with the requested ### headers."
            )
            
            system_instruction = f"{persona['sys']}\n{persona['inst']}{json_requirement}"

            # 3. Route through unified AIService
            response = await ai_service.generate_static(
                system_prompt=system_instruction, 
                user_prompt=user_prompt
            )
            
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
        # Add heuristic signals for increased ground-truth texture
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
            # Extract JSON from response (may contain markdown code blocks)
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
                narrative_summary=response_text[:200],  # Use first 200 chars
                anomalous_uids=[],
                escalation_indicators=[],
                confidence=0.3,
            )

    def scale_tak_data(self, tak_clauses: List[Dict], target_count: int = 5) -> str:
        """
        Scale TAK data up to prevent token exhaustion.
        Summarize multiple TAK clauses into fewer, aggregated narratives.
        """
        if not tak_clauses:
            return ""

        # Group by UID
        uid_groups: Dict[str, List[Dict]] = {}
        for clause in tak_clauses:
            uid = clause.get("uid", "unknown")
            if uid not in uid_groups:
                uid_groups[uid] = []
            uid_groups[uid].append(clause)

        # Summarize per UID
        summaries = []
        for uid, clauses in list(uid_groups.items())[:target_count]:
            latest = clauses[-1]  # Most recent clause
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
        """
        Scale GDELT data to prevent token exhaustion.
        Aggregate events by CAMEO code.
        """
        if not gdelt_clauses:
            return ""

        # Group by event code
        code_groups: Dict[str, List[Dict]] = {}
        for clause in gdelt_clauses:
            code = clause.get("predicate_type", "UNKNOWN")
            if code not in code_groups:
                code_groups[code] = []
            code_groups[code].append(clause)

        # Summarize per code
        summaries = []
        for code, clauses in list(code_groups.items())[:target_count]:
            summary = f"{code}: {len(clauses)} events, latest: {clauses[-1].get('narrative', 'N/A')[:100]}"
            summaries.append(summary)

        return "\n".join(summaries)
