import logging
import os
import yaml
from typing import AsyncGenerator, Optional

import litellm
from litellm import Router, acompletion
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
        self.router: Optional[Router] = None
        self.model_map = self._load_model_map()
        self._apply_litellm_settings()
        self.router = self._build_router()

    def _read_config(self) -> dict:
        try:
            if not os.path.exists(_LITELLM_CONFIG_PATH):
                logger.warning(f"LiteLLM config not found at {_LITELLM_CONFIG_PATH}")
                return {}
            with open(_LITELLM_CONFIG_PATH) as f:
                return yaml.safe_load(f) or {}
        except Exception as e:
            logger.warning(f"Could not load LiteLLM config: {e}")
            return {}

    def _load_model_map(self) -> dict:
        try:
            cfg = self._read_config()
            model_map = {}
            for m in cfg.get("model_list", []):
                name = m["model_name"]
                params = m.get("litellm_params", {}).copy()
                missing_env = []
                for key, val in params.items():
                    if isinstance(val, str) and val.startswith("os.environ/"):
                        env_var = val.split("/", 1)[1]
                        resolved = os.getenv(env_var)
                        if resolved is None:
                            missing_env.append(env_var)
                        params[key] = resolved
                if missing_env:
                    # Leaving the "os.environ/..." placeholder in place produces a
                    # baffling provider error at call time; skip the entry instead.
                    logger.warning(
                        "Model '%s' disabled: unset environment variable(s) %s",
                        name,
                        ", ".join(missing_env),
                    )
                    continue
                model_map[name] = params
            return model_map
        except Exception as e:
            logger.warning(f"Could not load LiteLLM config: {e}")
            return {}

    def _apply_litellm_settings(self) -> None:
        """Apply the litellm_settings block from the config file.

        Only library-mode settings take effect here.  Guardrail callbacks
        (e.g. Presidio PII redaction) are implemented as LiteLLM *proxy*
        hooks and silently do nothing when this API calls litellm directly —
        say so loudly instead of pretending the config is active.
        """
        settings = self._read_config().get("litellm_settings") or {}
        if settings.get("drop_params"):
            litellm.drop_params = True
        callbacks = settings.get("callbacks") or []
        if callbacks:
            logger.warning(
                "litellm_settings.callbacks %s are configured but only honored "
                "by the LiteLLM proxy — they are NOT active in library mode. "
                "PII redaction requires running the proxy with Presidio services.",
                callbacks,
            )

    def _build_router(self) -> Optional[Router]:
        """Build a litellm Router so router_settings.fallbacks actually apply.

        Without this, fallback chains in the config (e.g. public-flash →
        deep-reasoner) were dead configuration: direct acompletion() calls
        never consult router_settings.
        """
        if not self.model_map:
            return None

        raw_fallbacks = (
            self._read_config().get("router_settings", {}) or {}
        ).get("fallbacks") or []

        fallbacks = []
        for entry in raw_fallbacks:
            if not isinstance(entry, dict):
                continue
            for primary, backups in entry.items():
                if primary not in self.model_map:
                    logger.warning(
                        "Fallback entry for unavailable model '%s' ignored", primary
                    )
                    continue
                valid_backups = [b for b in (backups or []) if b in self.model_map]
                dropped = [b for b in (backups or []) if b not in self.model_map]
                if dropped:
                    logger.warning(
                        "Fallbacks %s for '%s' unavailable and dropped",
                        dropped,
                        primary,
                    )
                # An empty backup list means fail-closed, which is the Router
                # default when no fallback entry exists — skip it.
                if valid_backups:
                    fallbacks.append({primary: valid_backups})

        try:
            router = Router(
                model_list=[
                    {"model_name": name, "litellm_params": params.copy()}
                    for name, params in self.model_map.items()
                ],
                fallbacks=fallbacks,
            )
            logger.info(
                "LiteLLM Router initialised with %d model(s), fallbacks=%s",
                len(self.model_map),
                fallbacks or "none",
            )
            return router
        except Exception as exc:
            logger.warning(
                "LiteLLM Router init failed (%s) — falling back to direct "
                "completions without fallback routing",
                exc,
            )
            return None

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

    async def _acompletion(self, messages: list, stream: bool = False):
        """Complete via the Router (fallback-aware) when the active model is
        managed by it; otherwise fall back to a direct litellm call."""
        active_model = await self.get_active_model()
        if self.router is not None and active_model in self.model_map:
            return await self.router.acompletion(
                model=active_model,
                messages=messages,
                stream=stream,
            )
        params = self.model_map.get(active_model, {"model": active_model})
        return await acompletion(**params, messages=messages, stream=stream)

    async def generate_stream(
        self, system_prompt: str, user_prompt: str
    ) -> AsyncGenerator[str, None]:
        """Stream completion from the active model."""
        model_name = await self.get_active_model()

        logger.info(f"🚀 [UNIFIED-BRAIN] Initiating stream from model: {model_name}")

        try:
            response = await self._acompletion(
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
            yield "Error: Internal AI processing error"

    async def generate_static(self, system_prompt: str, user_prompt: str) -> str:
        """Get a full static completion from the active model."""
        model_name = await self.get_active_model()

        logger.info(f"🧠 [UNIFIED-BRAIN] Processing static completion for model: {model_name}")

        try:
            response = await self._acompletion(
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
