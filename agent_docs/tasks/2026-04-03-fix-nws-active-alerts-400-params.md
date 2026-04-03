# 2026-04-03 - Fix NWS Active Alerts 400 Query Params

## Issue
The new NWS active alerts ingestion path returned HTTP 400 responses when polling `https://api.weather.gov/alerts/active`.

## Solution
Validated the upstream endpoint behavior and removed unsupported query parameter usage from the infra poller request.

## Changes
- Updated `backend/ingestion/infra_poller/main.py`:
  - Changed NWS alert query params from `{status: actual, limit: 500}` to `{status: actual}`.
  - Added inline note documenting weather.gov rejection of unsupported params on `/alerts/active`.
- Updated `RELEASE_NOTES.md`:
  - Clarified that `/analyze/air|sea|orbital` are backend API endpoints and AI Analyst panel still uses `/api/analyze/{uid}`.

## Verification
- Reproduced endpoint behavior from terminal:
  - `/alerts/active?limit=500` -> `400`
  - `/alerts/active?status=actual` -> `200`
- Ran targeted infra poller verification:
  - `cd backend/ingestion/infra_poller && uv tool run ruff check . && uv run python -m pytest`
  - Result: `88 passed`, lint clean.

## Benefits
- Restores reliable NWS alert ingestion.
- Prevents repeated poller error churn from deterministic bad request parameters.
- Keeps release notes accurate about backend-vs-UI endpoint wiring.
