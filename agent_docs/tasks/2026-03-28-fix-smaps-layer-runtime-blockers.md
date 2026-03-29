# 2026-03-28 - Fix SMAPS Layer Runtime Blockers

## Issue
The SMAPS/piracy layer was not loading after infra-poller rebuild. Runtime diagnosis showed multiple blockers:
- Frontend map bounds occasionally sent wrapped longitudes outside API constraints (e.g. `< -180`), causing `422` on `/api/smaps/incidents`.
- Live database still used legacy table/index names (`asam_incidents`, `ix_asam_*`) while backend/poller now query `smaps_incidents`, causing API `500` before migration.
- SMAPS source endpoint from NGA returned bot-protection HTML (`Request Rejected`) to the poller container instead of JSON, resulting in zero ingested incidents.

## Solution
Applied local/runtime fixes and improved diagnostics:
- Migrated live DB objects from ASAM names to SMAPS names.
- Normalized frontend SMAPS query bounds to API-valid latitude/longitude ranges.
- Improved infra-poller SMAPS logging and payload handling to explicitly report non-JSON/blocked source responses.

## Changes
- Updated `frontend/src/hooks/useSMAPSWarnings.ts`:
  - Clamp `minLat/maxLat` to `[-90, 90]`.
  - Clamp `minLon/maxLon` to `[-180, 180]`.
  - Use normalized bounds in request URL and cache key.
- Updated `backend/ingestion/infra_poller/main.py`:
  - `smaps_loop` gate-closed message moved to info-level logging.
  - `_fetch_and_ingest_smaps` now parses body via `json.loads` with explicit error handling for blocked/non-JSON responses and body preview logging.
- Runtime DB migration (executed in TimescaleDB container):
  - `asam_incidents` -> `smaps_incidents`
  - `ix_asam_geom` -> `ix_smaps_geom`
  - `ix_asam_date` -> `ix_smaps_date`
  - `ix_asam_threat` -> `ix_smaps_threat`
  - `ix_asam_date_threat` -> `ix_smaps_date_threat`

## Verification
- Frontend checks:
  - `cd frontend && pnpm run lint && pnpm run test`
  - Result: pass (lint clean, 36 tests passed).
- Runtime/API checks:
  - `/api/smaps/incidents` now returns `200` with empty FeatureCollection (no DB error).
  - Infra poller logs show SMAPS gate status at startup (`SMAPS gate closed ...`) and explicit source rejection diagnostics.
  - `SELECT COUNT(*) FROM smaps_incidents;` shows `0` rows due upstream source rejection.

## Benefits
- Removes local integration failures (422 + 500) that prevented the layer from rendering even when data exists.
- Adds clear runtime diagnostics for SMAPS ingestion state and upstream source failures.
- Isolates the remaining blocker to external NGA anti-bot response behavior.
