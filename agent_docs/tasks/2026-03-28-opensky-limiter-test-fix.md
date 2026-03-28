# 2026-03-28 - OpenSky Limiter Test Fixture Fix

## Issue
OpenSky-related aviation poller tests were failing because test fixtures mocked `OpenSkyClient._limiter`, while the implementation now uses route-specific limiters (`_limiter_bbox` and `_limiter_watchlist`) inside `_fetch_states()`.

## Solution
Updated test fixtures to inject async-compatible limiter mocks into the correct limiter attributes used by current implementation.

## Changes
- Updated `backend/ingestion/aviation_poller/tests/test_opensky_client.py`:
  - In `TestOpenSkyClientFetch._make_client()`, replaced `client._limiter` mocking with `client._limiter_bbox` and `client._limiter_watchlist` async context manager mocks.
- Updated `backend/ingestion/aviation_poller/tests/test_opensky_watchlist.py`:
  - In `TestFetchIcaoList._make_client()`, replaced `client._limiter` mocking with `client._limiter_bbox` and `client._limiter_watchlist`.

## Verification
- `cd backend/ingestion/aviation_poller && ruff check .`
- `cd backend/ingestion/aviation_poller && python -m pytest tests/test_opensky_client.py tests/test_opensky_watchlist.py`
- `cd backend/ingestion/aviation_poller && python -m pytest`

## Benefits
- Restores OpenSky test reliability under the current client implementation.
- Prevents false CI failures due to stale fixture assumptions.
- Keeps rate-limiter behavior covered by async-compatible test doubles.
