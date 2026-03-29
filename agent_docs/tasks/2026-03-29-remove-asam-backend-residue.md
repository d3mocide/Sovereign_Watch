# 2026-03-29 - Remove ASAM Backend Residue

## Issue
Active backend runtime and schema code still contained ASAM-era identifiers (function names, SQL table names, and comments) after the SMAPS migration. The user requested a strict cleanup to ensure ASAM is removed from active implementation paths.

## Solution
Completed a final backend-focused rename pass from ASAM to SMAPS across ingestion logic, API query targets, and DB initialization schema, while keeping legacy payload parsing behavior available under SMAPS-named compatibility helpers.

## Changes
- Updated `backend/ingestion/infra_poller/main.py`:
  - Removed ASAM env var fallbacks.
  - Renamed severity/recency/threat helpers to SMAPS names.
  - Renamed legacy parser and ingest upsert helper to SMAPS names.
  - Switched ingest SQL target from `asam_incidents` to `smaps_incidents`.
  - Updated SMAPS loop/fetch docstrings and logging text to SMAPS-only wording.
- Updated `backend/api/routers/smaps.py`:
  - Changed query documentation and SQL source table from `asam_incidents` to `smaps_incidents`.
- Updated `backend/api/routers/maritime.py`:
  - Changed maritime risk query source table from `asam_incidents` to `smaps_incidents`.
- Updated `backend/api/services/schema_context.py`:
  - Renamed schema heading text to `SMAPS_INCIDENTS`.
- Updated `backend/db/init.sql`:
  - Renamed table definition from `asam_incidents` to `smaps_incidents`.
  - Renamed indexes `ix_asam_*` to `ix_smaps_*`.
  - Updated comments to SMAPS terminology.
- Updated ingestion tests:
  - Migrated helper imports/assertions to SMAPS names.
  - Renamed `backend/ingestion/infra_poller/tests/test_asam.py` to `backend/ingestion/infra_poller/tests/test_smaps.py` and removed duplicate ASAM-named file.

## Verification
- `cd backend/api && d:/Projects/SovereignWatch/.venv/Scripts/python.exe -m ruff check . && d:/Projects/SovereignWatch/.venv/Scripts/python.exe -m pytest`
  - Result: ruff passed, `46 passed`.
- `cd backend/ingestion/infra_poller && d:/Projects/SovereignWatch/.venv/Scripts/python.exe -m ruff check . && d:/Projects/SovereignWatch/.venv/Scripts/python.exe -m pytest`
  - Result: ruff passed, `94 passed`.

## Benefits
- Eliminates ASAM naming residue from active backend runtime and schema definitions.
- Aligns ingestion, API, and DB naming with the SMAPS data model.
- Improves consistency for future maintenance and reduces migration confusion.
