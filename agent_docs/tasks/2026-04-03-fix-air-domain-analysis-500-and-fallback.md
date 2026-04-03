# 2026-04-03 - Fix Air Domain Analysis 500 and Frontend Fallback

## Issue
AI Analyst domain routing for ADS-B targets returned HTTP 500 in `/api/ai_router/analyze/air`.

## Root Cause
`analyze_air_domain` assumed `adverbial_context` from `clausal_chains` was always a dict. In some rows it is a JSON string, causing:
`AttributeError: 'str' object has no attribute 'get'`.

## Solution
1. Backend: normalize `adverbial_context` payloads (dict|string|other) before reading squawk fields.
2. Frontend: if domain endpoint fails, automatically fall back to the existing `/api/analyze/{uid}` streaming analyzer instead of hard-failing panel execution.

## Changes
- Updated `backend/api/routers/ai_router.py`:
  - Added `_coerce_context_map()` helper.
  - Used helper in emergency squawk detection in `analyze_air_domain`.
- Updated `frontend/src/hooks/useAnalysis.ts`:
  - Wrapped `runDomainAnalysis()` call in try/catch.
  - Added fallback to legacy streaming analysis path on domain failure.

## Verification
- Backend stack trace confirmed root cause in logs at `analyze_air_domain`.
- Targeted verification commands run after patch:
  - `cd backend/api && uv tool run ruff check . && uv run python -m pytest`
  - `cd frontend && pnpm run lint && pnpm run test`

## Benefits
- ADS-B domain analysis no longer crashes on mixed JSON storage formats.
- AI Analyst panel remains operational even if domain endpoints encounter transient failures.
