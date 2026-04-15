## Issue

The GDELT pulse poller was still calling the retired ReliefWeb v1 disasters endpoint. ReliefWeb now serves the API from v2 and, as of November 2025, requires a pre-approved `appname` query parameter. The old integration therefore produced 410 responses continuously.

## Solution

Updated the ReliefWeb client to target the v2 disasters endpoint, send `appname` as a URL query parameter, and disable ReliefWeb polling with a clear operator-facing error when the app name is missing or rejected.

## Changes

- Updated `backend/ingestion/gdelt_pulse/service.py` to use `https://api.reliefweb.int/v2/disasters`, read `RELIEFWEB_APPNAME` from environment, attach it as a query parameter, and stop retrying once the service detects a missing or unapproved app name.
- Updated `backend/ingestion/gdelt_pulse/tests/test_gdelt.py` to cover the new request contract, missing-appname short-circuiting, and appname rejection handling.
- Updated `docker-compose.yml`, `.env.example`, and `.env` to surface the new `RELIEFWEB_APPNAME` configuration for the `sovereign-gdelt-pulse` service.

## Verification

- `cd backend/ingestion/gdelt_pulse && uv tool run ruff check .`
- `cd backend/ingestion/gdelt_pulse && uv run python -m pytest`
- Result: lint passed and all 22 gdelt_pulse tests passed.

## Benefits

- Removes the hard failure caused by ReliefWeb v1 retirement.
- Makes the remaining operator action explicit: configure an approved ReliefWeb app name.
- Prevents repetitive noisy polling once the service identifies a permanent ReliefWeb configuration error.