# 2026-03-27 Fix AI Analyst Panel 500 Errors

## Issue
Users reported 500 Internal Server Errors when attempting to use the AI Analyst Panel on ADSB (aviation) and AIS (maritime) targets. The panel worked correctly for GDELT, SITREP, and Satellite data.

## Solution
Investigation revealed two primary causes:
1. **Fragile SQL Query**: The `track_query` in `backend/api/routers/analysis.py` used `SELECT s.*, m.type, m.meta` which caused naming collisions and ambiguity when `asyncpg` converted the results to a dictionary. Additionally, the cross join triggered 500s when metadata records were inconsistently formatted.
2. **Type Error (AttributeError)**: When the `meta` column was retrieved as a JSON string from the database (common for raw AIS/ADSB telemetry) instead of a native dictionary, the code crashed with `'str' object has no attribute 'get'`.

## Changes
- **backend/api/routers/analysis.py**:
    - Rewrote `track_query` to use explicit column names and a `LEFT JOIN` for reliability.
    - Switched `json_agg` to `jsonb_agg` for better handling of `NaN` or edge case telemetry values.
    - Cast `lookback_hours` to `float` as a safety measure for PostgreSQL interval multiplication.
    - Added a robust check in the Python logic to ensure `meta` is parsed from JSON if it arrives as a string.
    - Enhanced error logging with `exc_info=True` to provide full tracebacks for future database-related analysis failures.

## Verification
- Reproduced the 500 error using a real AIS target MMSI (`368293000`) via a manual CLI request to the backend.
- Applied the fixes and verified the same request now returns `200 OK` with a valid streaming AI assessment.
- Confirmed that GDELT and SAT analysis paths remain functional.

## Benefits
- Restores deep-dive analysis capability for maritime and aviation assets.
- Improved system stability when handling large telemetry buffers.
- Easier debugging of future analysis issues due to improved logging.
