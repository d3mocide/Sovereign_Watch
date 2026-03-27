# 2026-03-26 Environment Variables for Holding Pattern Detection

## Issue
New environment variables for holding pattern detection were added in a recent PR but were not yet integrated into the `docker-compose.yml` or documented in `.env.example`. Additionally, the code was still using hardcoded constants for these values.

## Solution
1. Modified `backend/ingestion/aviation_poller/holding_pattern.py` to use `os.getenv()` for all detection thresholds.
2. Added the variables to `docker-compose.yml` under the `sovereign-adsb-poller` service.
3. Updated `.env.example` with a new section for Aviation Ingestion configuration.
4. Performed a comprehensive documentation sweep across `Documentation/Configuration.md`, `ADSB.md`, `README.md`, and `UI_Guide.md` to reflect these changes and integrate the new Intel Globe mode.
5. Refactored `backend/ingestion/aviation_poller/tests/test_holding_pattern.py` to correctly mock async Redis calls and updated assertions to match the logic.

## Changes
- `backend/ingestion/aviation_poller/holding_pattern.py`: Added `os` import and updated threshold constants.
- `docker-compose.yml`: Added 5 new environment variables to `sovereign-adsb-poller`.
- `.env.example`: Added detailed documentation and default values for the new variables.
- `Documentation/`: Updated multiple files (`Configuration.md`, `pollers/ADSB.md`, `README.md`, `UI_Guide.md`) with holding pattern and Intel Globe details.
- `backend/ingestion/aviation_poller/tests/test_holding_pattern.py`: Fixed `AsyncMock` usage in `test_redis_connection` and updated `test_spiral_climb` range check.

## Verification
- Ran `pytest` in `backend/ingestion/aviation_poller/`. 
- `test_holding_pattern.py` passes all 15 tests.
- (Note: Some existing tests in other files have pre-existing mocking issues unrelated to these changes.)

## Benefits
- Allows operators to fine-tune detection logic without rebuilding containers.
- Improves documentation for new features.
- Ensures consistency between codebase and configuration.
