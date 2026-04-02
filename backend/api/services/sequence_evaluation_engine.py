"""
Sequence Evaluation Engine: Routes aligned clausal chains through LiteLLM for narrative analysis.
Implements zero-shot prompting for topological narrative analysis and escalation detection.
"""

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx

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
    """Routes clausal chain sequences through LiteLLM for AI-driven analysis."""

    SYSTEM_PROMPT = """You are a Sequence Evaluation Engine specializing in topological narrative analysis.
Your task is to analyze geopolitical events (GDELT) and tactical telemetry (TAK) to identify escalation patterns and anomalies.

ESCALATION PATTERNS to identify:
- protests → police_deployment → violent_clashes
- demonstrate → law_enforcement → arrests
- strike → military_mobilization
- armed_conflict → civilian_casualties → humanitarian_crisis

ANOMALY INDICATORS in TAK data:
- Sudden clustering of aircraft/vessels in a region (>5 entities in <2 km²)
- Rapid directional changes and holding patterns
- Emergency transponder activations
- Military aircraft concentrations in civilian airspace

OUTPUT REQUIREMENTS:
You must return valid JSON with exactly these fields:
{
    "risk_score": <float 0.0-1.0>,
    "narrative_summary": "<2-3 sentence human-readable synthesis>",
    "anomalous_uids": ["uid1", "uid2", ...],
    "escalation_indicators": ["indicator1", "indicator2", ...],
    "confidence": <float 0.0-1.0>
}

Be concise and factual. Do not speculate beyond the data provided."""

    def __init__(self, litellm_config: Dict[str, Any]):
        """
        Initialize with LiteLLM configuration.

        Args:
            litellm_config: Dict with keys: api_key, api_base, model_name
        """
        self.litellm_config = litellm_config
        self.api_key = litellm_config.get("api_key", "")
        self.api_base = litellm_config.get("api_base", "http://localhost:11434")
        self.model_name = litellm_config.get("model_name", "llama3")
        self.timeout_s = 30.0

    async def evaluate_escalation(
        self,
        h3_region: str,
        gdelt_summary: str,
        tak_summary: str,
        anomalous_uids: List[str],
    ) -> RiskAssessment:
        """
        Evaluate escalation risk for a region using LiteLLM.

        Args:
            h3_region: H3-7 hexagonal region ID
            gdelt_summary: Narrative summary of GDELT events in region
            tak_summary: Narrative summary of TAK telemetry in region
            anomalous_uids: Pre-identified anomalous entity UIDs

        Returns:
            RiskAssessment object with structured output
        """
        # Build user prompt with context
        user_prompt = self._build_context_window(
            h3_region, gdelt_summary, tak_summary, anomalous_uids
        )

        try:
            # Route through LiteLLM (local Ollama or cloud API)
            response = await self._call_litellm(user_prompt)
            risk_assessment = self._parse_response(response, h3_region)
            risk_assessment.raw_response = response
            return risk_assessment

        except Exception as e:
            logger.error(f"Error in sequence evaluation: {e}")
            # Return low-confidence default assessment
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
    ) -> str:
        """Build the user prompt with scaled contextual data."""
        prompt = f"""Analyze the following multi-INT data for regional risk:

REGION: H3 Cell {h3_region}

GEOPOLITICAL CONTEXT (GDELT):
{gdelt_summary if gdelt_summary else "No recent GDELT events in region"}

TACTICAL TELEMETRY (TAK):
{tak_summary if tak_summary else "No recent TAK activity in region"}

ANOMALOUS ENTITIES:
{', '.join(anomalous_uids) if anomalous_uids else "None identified"}

Based on this data, identify escalation patterns, risk indicators, and provide a risk assessment."""
        return prompt

    async def _call_litellm(self, user_prompt: str) -> str:
        """Call LiteLLM API (local Ollama or cloud), with semantic cache look-aside."""
        redis_url = os.getenv("REDIS_URL", "redis://sovereign-redis:6379")
        sem_cache = await get_semantic_cache(redis_url)

        cached = await sem_cache.check(user_prompt)
        if cached is not None:
            logger.info("SemanticCache hit — skipping LLM call")
            return cached

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,  # Deterministic analysis
            "max_tokens": 500,
        }

        headers = {
            "Content-Type": "application/json",
        }

        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                response = await client.post(
                    f"{self.api_base}/v1/chat/completions",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                data = response.json()
                result_text = data["choices"][0]["message"]["content"]

            await sem_cache.store(user_prompt, result_text)
            return result_text
        except Exception as e:
            logger.error(f"LiteLLM API error: {e}")
            raise

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
