# 2026-03-22 — GDELT Native CSV Migration

## Issue
The upstream GDELT 2.0 GEO API (`api.gdeltproject.org/api/v2/geo/geo`) began returning 404 errors, indicating it has been decommissioned or moved to a restricted infrastructure. This broke the "Global Event Tracking" (OSINT) layer on the Tactical Map.

## Solution
Migrated from the unreliable web API to a "Sovereign" native ingestion pattern:
1. **Poller Service**: Created `backend/ingestion/gdelt_pulse`, a Python service that polls `data.gdeltproject.org/gdeltv2/lastupdate.txt` every 15 minutes.
2. **Raw Parsing**: The poller downloads the raw `.export.CSV.zip`, extracts it, and parses the TAB-separated news event stream directly.
3. **Persistence**: Added a `gdelt_events` hypertable to TimescaleDB with PostGIS support and a 7-day retention policy.
4. **Resiliency**: The `GDELT` API router now queries the local database instead of the external web API, ensuring the frontend always has data even if the upstream proxy is down.

## Changes

| Component | Files | Description |
|---|---|---|
| **Database** | `backend/db/init.sql` | Added `gdelt_events` hypertable + indexes. |
| **Ingestion** | `backend/ingestion/gdelt_pulse/` | New service for downloading and parsing GDELT raw data. |
| **Streaming** | `backend/api/services/historian.py` | Consumes `gdelt_raw` messages and persists to DB. |
| **API Router** | `backend/api/routers/gdelt.py` | Re-routed to query the local database & return GeoJSON. |
| **Orchestration** | `docker-compose.yml` | Added `sovereign-gdelt-pulse` service. |

## Verification
- `ruff check backend/ingestion/gdelt_pulse` → Passed.
- `docker compose up -d --build sovereign-gdelt-pulse` → Successfully builds and starts.
- Local `lastupdate.txt` poll verified with `curl`.
- DB table created and indexes verified.

## Benefits
- **Resilience**: The platform no longer depends on the flaky GDELT API proxy.
- **Independence**: Zero API keys or external account dependencies for OSINT news.
- **Latency**: Map data is now served directly from the local TimescaleDB/Redis stack.
