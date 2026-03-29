# 2026-03-28 - Replace Legacy ASAM Feed With SMAPS Ingestion

## Issue
The legacy ASAM JSON endpoint became unreliable/unavailable, while NGA NavWarnings SMAPS data remains active and current. We also need to ingest non-piracy maritime hazards (not just piracy incidents).

## Solution
Refactored infra poller ASAM ingestion to accept SMAPS as the primary feed, parse coordinates from warning text when explicit lat/lon fields are absent, and map records into the existing `asam_incidents` contract for API/front-end compatibility.

## Changes
- Updated `backend/ingestion/infra_poller/main.py`:
  - Changed default `ASAM_URL` to SMAPS endpoint:
    - `https://msi.nga.mil/api/publications/smaps?output=json&status=active`
  - Added SMAPS parsing helpers:
    - `parse_smaps_coordinates` (DDM coordinate extraction from warning text)
    - `parse_smaps_incident_date` (parses `createdOn` / fallback `ingestDate`)
    - `parse_smaps_json` (maps SMAPS records to existing incident shape)
  - Expanded severity keyword mapping to include non-piracy hazard categories.
  - Updated `_fetch_and_ingest_asam` to:
    - parse SMAPS payload shape (`{"smaps": [...]}`)
    - fallback to legacy ASAM list parsing for compatibility
    - keep writing to `asam_incidents` and Redis key `asam:latest`
- Updated `backend/ingestion/infra_poller/tests/test_asam.py`:
  - Added tests for SMAPS coordinate/date parsing and mixed category ingestion.
- Updated environment defaults:
  - `docker-compose.yml`: `ASAM_URL` default now points to SMAPS.
  - `.env.example`: `ASAM_URL` default now points to SMAPS.

## Verification
- Ran targeted infra poller checks:
  - `cd backend/ingestion/infra_poller && ruff check . && python -m pytest`

## Benefits
- Removes dependency on sunsetted legacy ASAM JSON endpoint.
- Ingests live maritime warnings with piracy and broader hazards.
- Preserves current API/frontend contract, minimizing regression risk while enabling future category-first overhaul.
