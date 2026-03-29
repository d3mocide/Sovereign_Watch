## Issue

Direct SMAPS fetches from the infra poller were receiving an NGA "Request Rejected" HTML page instead of JSON, preventing scheduled ingestion from populating the piracy layer.

## Solution

Tested multiple anti-bot mitigation patterns against the live endpoint and updated the poller to send a browser-like header profile only for direct `msi.nga.mil` requests.

## Changes

- Updated `backend/ingestion/infra_poller/main.py` to add SMAPS-specific browser headers.
- Added `smaps_request_headers()` so direct NGA calls use the browser profile while proxy calls keep standard service headers.
- Added unit tests in `backend/ingestion/infra_poller/tests/test_smaps.py` for direct-vs-proxy header selection.

## Verification

- Host probe with `aiohttp` and browser-like headers returned `application/json;charset=UTF-8` successfully across repeated requests.
- Ran `cd backend/ingestion/infra_poller && python -m ruff check . && python -m pytest`.
- Live smoke test inside `sovereign-infra-poller` still returned the NGA `Request Rejected` HTML page, so the header fix is not sufficient for the container egress path.

## Benefits

- Preserves a proven host-side mitigation that may help in non-containerized or differently-routed environments.
- Keeps proxy support intact without forcing internal services to mimic a browser.
- Documents the anti-bot behavior and the proven mitigation for future maintenance.