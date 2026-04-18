# FIRMS Poller Alias And Cooldown Fix

## Issue

The FIRMS poller accepted an invalid source token (`VIIRS_SNPP_NR`) from configuration, which caused repeated `400 Bad Request` responses from NASA FIRMS. Separately, when Redis had no FIRMS cache entry and a poll returned no hotspots, the cooldown-bypass logic reset every loop and caused repeated immediate re-polls instead of waiting for the normal cadence.

## Solution

Added source alias normalization for the legacy SNPP token and changed the empty-cache bypass bookkeeping so the bypass is only used once per empty-cache streak until a real cache payload exists again.

## Changes

- Updated `backend/ingestion/space_pulse/sources/firms.py` to normalize `VIIRS_SNPP_NR` to `VIIRS_SNPP_NRT` with a warning.
- Updated the FIRMS run loop to preserve the empty-cache bypass guard until the Redis hotspot cache is populated.
- Added targeted regression tests in `backend/ingestion/space_pulse/tests/test_firms.py`.

## Verification

- `uv tool run ruff check d:/Projects/Sovereign_Watch/backend/ingestion/space_pulse` passed.
- `uv run --directory d:/Projects/Sovereign_Watch/backend/ingestion/space_pulse python -m pytest tests/test_firms.py` remains blocked by the known Windows / Python 3.14 `asyncpg==0.30.0` build failure.
- Direct workspace venv pytest execution could not be used because `pytest` is not installed in `d:/Projects/Sovereign_Watch/.venv`.

## Benefits

- Misconfigured SNPP source values no longer poison the FIRMS poll cycle.
- Empty-cache startup or no-hotspot periods no longer create a tight request loop against the FIRMS API.
- Poller behavior now matches the intended cadence under empty but healthy upstream responses.