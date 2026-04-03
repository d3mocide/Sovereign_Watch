# 2026-04-03 - Wire AI Analyst Domain Persona Routing

## Issue
Domain analysis endpoints (`/api/ai_router/analyze/air|sea|orbital`) existed in backend, but the AI Analyst panel still only used legacy streaming endpoint `/api/analyze/{uid}`.

## Solution
Extended frontend analysis routing to infer domain from selected CoT entity type and call the matching domain endpoint automatically, with fallback to existing SSE stream for unsupported entity classes and SITREP flows.

## Changes
- Updated `frontend/src/api/analysis.ts`:
  - Added domain inference from `CoTEntity` (`air`, `sea`, `orbital`).
  - Added domain request/response typing and formatter for `DomainAnalysisResponse`.
  - Added `runDomainAnalysis(entity, lookbackHours)` client function targeting `/api/ai_router/analyze/{domain}`.
- Updated `frontend/src/hooks/useAnalysis.ts`:
  - Extended `run(...)` signature to accept optional `entity`.
  - Added domain-first analysis execution path for non-SITREP entities.
  - Preserved existing `/api/analyze/{uid}` SSE path as fallback.
- Updated `frontend/src/components/widgets/AIAnalystPanel.tsx`:
  - Passed selected `entity` into analysis `run(...)` for both auto-run and manual run.

## Verification
- Frontend verification command:
  - `cd frontend && pnpm run lint && pnpm run test`

## Benefits
- Persona selection now aligns with CoT domain context automatically.
- Air/Sea/Orbital entities invoke domain-specialized backend analysts by default.
- Existing generalized streaming analysis remains intact for other entity types and SITREPs.
