## Issue

The SatNOGS ingestion adapters for both the transmitter catalog and observation feed were able to enter a tight request loop. Successful responses never advanced pagination or executed the intended inter-page sleep, which could hammer upstream endpoints and ignore the configured hourly cooldown behavior.

## Solution

Moved the page-processing, pagination advance, and per-page delay logic out of the exception blocks so the success path runs correctly. Added regression tests that verify both adapters advance to the next page and sleep between paginated requests.

## Changes

- Updated `backend/ingestion/space_pulse/sources/satnogs_db.py`
  - Fixed the success-path indentation in `_fetch_and_publish()` so transmitter catalog pagination, publication, and backoff execute after a successful response.
- Updated `backend/ingestion/space_pulse/sources/satnogs_network.py`
  - Applied the same fix to the observations adapter so it respects pagination and rate-limit spacing.
- Updated `backend/ingestion/space_pulse/tests/test_satnogs_db.py`
  - Added a regression test that verifies multi-page transmitter fetches advance and sleep.
- Updated `backend/ingestion/space_pulse/tests/test_satnogs_network.py`
  - Added a regression test that verifies multi-page observation fetches advance and sleep.

## Verification

- Host lint: `cd backend/ingestion/space_pulse && uv tool run ruff check .` — passed.
- Host pytest: `cd backend/ingestion/space_pulse && uv run python -m pytest` — blocked by host Python 3.14 incompatibility building `asyncpg==0.30.0`.
- Container parity:
  - `docker compose -f docker-compose.yml -f compose.dev.yml up -d --build sovereign-space-pulse`
  - `docker compose exec sovereign-space-pulse uv run python -m pytest tests/test_satnogs_db.py tests/test_satnogs_network.py` — passed (`10` tests).
- Full container suite note:
  - `docker compose exec sovereign-space-pulse uv run python -m pytest` still reports two pre-existing failures in `tests/test_firms.py` related to `FIRMSSource.__init__()` requiring a `client` argument.

## Benefits

- Stops the accidental request storm against SatNOGS endpoints.
- Restores the intended hourly/daily fetch cadence and inter-page backoff behavior.
- Adds regression coverage so the same indentation bug is less likely to recur.