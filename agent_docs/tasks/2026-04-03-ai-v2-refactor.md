# 2026-04-03 AI Architecture V1.5 (Unified Reasoning)

## Issue
The Sovereign Watch AI reasoning was fragmented across multiple files (`analysis.py`, `sequence_evaluation_engine.py`, `ai_router.py`) with duplicated model configuration, hardcoded endpoints, and inconsistent persona management. This "split-brain" architecture made it impossible to consistently inject behavioral signals (like Rendezvous Detection) into all AI analyst paths.

## Solution
Consolidated all AI reasoning into a symbiotic `AIService` module. This service handles:
1. Centralized LiteLLM configuration and model selection via Redis.
2. Unified persona management (Tactical, OSINT, SAR, SITREP).
3. Consistent prompt injection of behavioral heuristics (Rendezvous, Clustering, Emergency Squawks).
4. Standardized streaming and static generation interfaces.

## Changes
- **[NEW]** `backend/api/services/ai_service.py`: The single source of truth for AI interactions.
- **[MODIFY]** `backend/api/services/sequence_evaluation_engine.py`: Refactored to use `AIService`.
- **[MODIFY]** `backend/api/routers/analysis.py`: Major refactor to use `AIService` and integrate `EscalationDetector` signals.
- **[MODIFY]** `backend/api/routers/ai_router.py`: Updated to use the unified service configuration.
- **[MODIFY]** `AGENTS.md`: Added mandatory architectural invariant for AI reasoning.

## Verification
1. Verified `AIService` initialization and persona loading.
2. Confirmed `analysis.py` now receives behavioral signals (Rendezvous) from `EscalationDetector`.
3. Validated that `SequenceEvaluationEngine` successfully routes through the unified `AIService`.

## Benefits
- **Symbiotic Intelligence**: Changes to models or personas now reflect globally.
- **Advanced Context**: All AI analyst reports now benefit from heuristic escalation signals (e.g., "Multi-entity rendezvous detected").
- **Maintainability**: Removed ~150 lines of redundant LLM plumbing and hardcoded configurations.
- **Future-Proof**: New AI features now have a clear, documented path for implementation.
