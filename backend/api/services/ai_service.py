import logging
import os
import yaml
from typing import AsyncGenerator

from litellm import acompletion
from core.database import db
from routers.system import AI_MODEL_DEFAULT, AI_MODEL_REDIS_KEY

logger = logging.getLogger("SovereignWatch.AIService")

_LITELLM_CONFIG_PATH = os.getenv("LITELLM_CONFIG_PATH", "/app/litellm_config.yaml")


class AIModelOverloadedError(Exception):
    """Raised when the upstream model is temporarily overloaded."""


def _is_model_overloaded_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        "serviceunavailableerror" in text
        or '"status": "unavailable"' in text
        or "currently experiencing high demand" in text
        or "please try again later" in text
        or "503 service unavailable" in text
    )


class AIService:
    """
    Unified AI Service Layer for Sovereign Watch.
    Handles LiteLLM configuration, persona management, and streaming completions.
    """

    def __init__(self):
        self.model_map = self._load_model_map()

    def _load_model_map(self) -> dict:
        try:
            if not os.path.exists(_LITELLM_CONFIG_PATH):
                logger.warning(f"LiteLLM config not found at {_LITELLM_CONFIG_PATH}")
                return {}
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

    async def get_active_model(self) -> str:
        """Retrieve the currently selected AI model from Redis."""
        active_model = AI_MODEL_DEFAULT
        if db.redis_client:
            stored = await db.redis_client.get(AI_MODEL_REDIS_KEY)
            if stored:
                active_model = (
                    stored.decode() if hasattr(stored, "decode") else str(stored)
                )
        return active_model

    async def get_model_params(self) -> dict:
        """Get the LiteLLM parameters for the active model."""
        active_model = await self.get_active_model()
        return self.model_map.get(active_model, {"model": active_model})

    def get_persona(self, mode: str, context: dict = None) -> dict:
        """
        Retrieve system and instruction prompts for a given operational mode.
        All personas are hardened with 'Negative Constraints' to ensure HUD stability.
        """
        mode = mode.lower()
        context = context or {}
        is_sitrep = (mode == "sitrep") or context.get("is_sitrep", False)
        is_hold = context.get("is_hold", False)
        is_gdelt = context.get("is_gdelt", False)

        # 1. Structural Lockdown Rules (Shared by all analysts)
        MARKDOWN_RULES = (
            "### MANDATORY FORMATTING RULES:\n"
            "1. Use '### HEADER NAME' (ALL CAPS) for every section.\n"
            "2. NEVER use '##' or '#' or '**Section**'. Only '###'.\n"
            "3. USE DASHES (- ) ONLY for lists. FORBIDDEN: Do not use '*' or '•' for lists.\n"
            "4. NEVER split bold tags (**text**) across a newline.\n"
            "5. NO PREAMBLE: Start immediately with the first ### header."
        )

        # 2. Section Definitions per mode
        persona_defs = {
            "sitrep": {
                "sys": "Sovereign Watch Strategic Director",
                "headers": "### ACTIVE ZONES, ### ACTOR BEHAVIOR, ### ESCALATION SIGNALS, ### CONFIDENCE",
                "goal": "Analyze the strategic escalation risk for this H3 region."
            },
            "tactical": {
                "sys": "Sovereign Watch Tactical Analyst",
                "headers": "### CLASSIFICATION, ### BEHAVIORAL ASSESSMENT, ### RISK SIGNALS, ### CONFIDENCE",
                "goal": "Assess the tactical profile and risk of this specific target."
            },
            "osint": {
                "sys": "Sovereign Watch OSINT Analyst",
                "headers": "### SOURCE/CONTEXT, ### ACTOR INTENT HYPOTHESIS, ### REGIONAL IMPACT, ### CONFIDENCE",
                "goal": "Evaluate the geopolitical and OSINT narrative for this target."
            },
            "sar": {
                "sys": "Sovereign Watch SAR Analyst",
                "headers": "### DISTRESS INDICATORS, ### OPERATIONAL RISK, ### RECOMMENDED ACTIONS, ### CONFIDENCE",
                "goal": "Identify Search and Rescue distress markers and mission risks."
            },
            "gdelt": {
                "sys": "Sovereign Watch Geopolitical Analyst",
                "headers": "### EVENT CONTEXT, ### POTENTIAL IMPACT, ### ESCALATION RISK, ### CONFIDENCE",
                "goal": "Assess the escalation risk and regional impact of this GDELT event."
            },
            "hold": {
                "sys": "Tactical Flight Safety Analyst",
                "headers": "### PATTERN EVIDENCE, ### RISK SIGNALS, ### CONFIDENCE",
                "goal": "Confirm and assess the Distant Pattern / Holding logic of this aircraft."
            },
            "hold_sar": {
                "sys": "Aviation SAR Specialist",
                "headers": "### DISTRESS EVIDENCE, ### CONFIDENCE",
                "goal": "Evaluate if this holding pattern indicates mechanical distress or mission failure."
            }
        }

        # 3. Dynamic Selection
        p_key = mode
        if is_sitrep:
            p_key = "sitrep"
        elif is_hold:
            p_key = "hold_sar" if mode == "sar" else "hold"
        elif is_gdelt and mode != "sar":
            p_key = "gdelt"
        
        selected = persona_defs.get(p_key, persona_defs["tactical"])

        return {
            "sys": f"You are the {selected['sys']}.",
            "inst": (
                f"{selected['goal']} Use exactly these sections in order: {selected['headers']}. "
                f"{MARKDOWN_RULES}"
            )
        }

    async def generate_stream(
        self, system_prompt: str, user_prompt: str
    ) -> AsyncGenerator[str, None]:
        """Stream completion from the active model."""
        params = await self.get_model_params()
        model_name = params.get("model", "unknown")
        
        logger.info(f"🚀 [UNIFIED-BRAIN] Initiating stream from model: {model_name}")
        
        try:
            response = await acompletion(
                **params,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                stream=True,
            )
            async for chunk in response:
                if content := chunk.choices[0].delta.content:
                    yield content
        except Exception as e:
            logger.error(f"AI Stream Error: {e}")
            if _is_model_overloaded_error(e):
                yield "Error: AI model temporarily overloaded. Please try again shortly."
                return
            yield f"Error: {str(e)}"

    async def generate_static(self, system_prompt: str, user_prompt: str) -> str:
        """Get a full static completion from the active model."""
        params = await self.get_model_params()
        model_name = params.get("model", "unknown")
        
        logger.info(f"🧠 [UNIFIED-BRAIN] Processing static completion for model: {model_name}")
        
        try:
            response = await acompletion(
                **params,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return response.choices[0].message.content
        except Exception as exc:
            if _is_model_overloaded_error(exc):
                logger.warning("AI model overloaded for model: %s", model_name)
                raise AIModelOverloadedError(
                    "AI model temporarily overloaded. Please try again shortly."
                ) from exc
            logger.exception("AI Static Error for model: %s", model_name)
            raise


# Singleton
ai_service = AIService()
