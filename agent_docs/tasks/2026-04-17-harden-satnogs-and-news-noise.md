# Harden SatNOGS And News Noise

## Issue

Backend logs showed repeated SatNOGS station fetch timeouts and recurring warnings for a missing `redisvl` import plus a nonstandard `42` status from the default DefenseNews RSS feed. The SatNOGS route already degraded gracefully, but the timeout case was still noisy and had no retry. The semantic-cache warning text was misleading because `redisvl` is already declared in the API dependencies.

## Solution

Added a single retry for transient SatNOGS timeouts, split timeout handling from other network failures so the metadata and logging are more precise, clarified the semantic-cache warning to point at a stale runtime instead of a missing pyproject entry, and removed DefenseNews from the default RSS feed list so it only returns if explicitly configured.

## Changes

- Updated `backend/api/routers/satnogs.py` with explicit upstream URL/timeout constants, one retry for timeout failures, and timeout-specific degraded responses.
- Updated `backend/api/services/semantic_cache.py` to log that `redisvl` is missing from the current runtime rather than telling operators to edit `pyproject.toml`.
- Updated `backend/api/routers/news.py` to drop the noisy DefenseNews feed from the default feed set.
- Added targeted regressions in `backend/api/tests/test_satnogs_router.py` and `backend/api/tests/test_news_router.py`.

## Verification

- `cd backend/api && uv tool run ruff check .` passed.
- `cd backend/api && uv run python -m pytest tests/test_satnogs_router.py tests/test_news_router.py` passed.

## Benefits

- SatNOGS transient TLS/connect stalls get one recovery attempt before falling back.
- Operators can distinguish upstream timeouts from broader network failures in the response metadata.
- Expected environment and third-party feed issues produce less misleading log noise.