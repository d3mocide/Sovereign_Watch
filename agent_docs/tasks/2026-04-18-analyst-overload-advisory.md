# Analyst Panel Overload Advisory

## Issue

Gemini and other LiteLLM-backed providers can return transient `503 / UNAVAILABLE / high demand` failures under load. The air, sea, and orbital domain routes were swallowing those failures and returning heuristic fallback text with no explicit signal to the frontend, so the analyst panel could not tell operators that the model was overloaded.

## Solution

Added explicit backend overload classification in the unified AI service, propagated overload metadata through the domain-analysis response contract, and rendered a dedicated warning banner in the analyst panel while still showing the heuristic fallback narrative.

## Changes

- Updated `backend/api/services/ai_service.py` to classify provider overload errors and raise `AIModelOverloadedError` for static domain-analysis calls.
- Updated `backend/api/routers/ai_router.py` to attach `ai_status` and `ai_notice` metadata on air, sea, and orbital overload fallbacks.
- Updated `frontend/src/api/analysis.ts` to return both formatted analysis text and an overload advisory.
- Updated `frontend/src/hooks/useAnalysis.ts` to store advisory state separately from hard errors and to recognize overload messages from legacy streaming fallbacks.
- Updated `frontend/src/components/widgets/AIAnalystPanel.tsx` to render an amber `Model Overloaded` notice above the analysis output.
- Added regressions in `backend/api/tests/test_ai_router_air.py` and `frontend/src/api/analysis.test.ts`.

## Verification

- `cd frontend && pnpm run lint` passed.
- `cd frontend && pnpm run typecheck` passed.
- `cd frontend && pnpm run test` passed `(19 files, 269 tests)`.
- `cd backend/api && uv tool run ruff check .` passed.
- `cd backend/api && uv run python -m pytest tests/test_ai_router_air.py tests/test_ai_router_sea.py` passed `(4 tests)`.

## Benefits

- Operators now get a clear, non-fatal warning when the provider is saturated instead of a misleading silent fallback.
- Domain heuristics remain available, so the panel stays useful during transient model outages.
- Overload handling is centralized in the unified AI service rather than re-implemented route by route.