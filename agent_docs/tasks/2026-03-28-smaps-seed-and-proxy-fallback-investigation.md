# 2026-03-28 - SMAPS Seed and Proxy Fallback Investigation

## Issue
Piracy/SMAPS layer remained empty after poller rebuild because upstream NGA publication endpoints were returning a blocked HTML response instead of JSON, resulting in zero ingested rows.

## Solution
1. Seeded a small SMAPS dev dataset into the live `smaps_incidents` table to immediately validate rendering and downstream API behavior.
2. Investigated proxy feasibility and added proxy-ready source fallback support in the poller so a relay URL can be introduced without further poller code changes.

## Changes
- Runtime data seed (TimescaleDB): inserted 5 incidents with references `SMAPS-DEV-001`..`SMAPS-DEV-005`.
- Updated `backend/ingestion/infra_poller/main.py`:
  - Added `SMAPS_PROXY_URL` environment variable support.
  - `_fetch_and_ingest_smaps` now uses source priority `[SMAPS_PROXY_URL, SMAPS_URL]`.
  - Added per-source diagnostics (`blocked`, `non-JSON`, request failure) and final all-sources-failed error.

## Verification
- Data seed checks:
  - `SELECT COUNT(*) FROM smaps_incidents;` -> `5`
  - `/api/smaps/incidents?days=365&threat_min=0&limit=50` -> HTTP `200`, `5` features returned
  - `/api/maritime/risk-assessment?...` -> HTTP `200`, non-zero incident_count near seeded point
- Poller checks:
  - `cd backend/ingestion/infra_poller && python -m ruff check . && python -m pytest` -> pass (94 tests)
  - One-shot fetch logs show source chain and block cause clearly:
    - `SMAPS: source blocked ... Request Rejected`
    - `SMAPS: all sources failed; skipping ingest cycle`

## Investigation Outcome (Option 3)
- NGA endpoints tested from both host and container return HTTP `200 text/html` with `Request Rejected` (bot protection), not JSON.
- This is an upstream access-control limitation, not a local parse/query bug.
- Poller is now ready to consume a proxy endpoint via `SMAPS_PROXY_URL` when available.

## Benefits
- Restores immediate visual validation of piracy layer via seeded incidents.
- Provides clear operational observability for upstream SMAPS failures.
- Reduces time-to-adopt for a relay/proxy approach by making poller source selection configurable.
