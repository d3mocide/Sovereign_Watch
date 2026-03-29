# 2026-03-28 - Backend SMAPS Cleanup

## Issue
Backend API still carried ASAM compatibility references after SMAPS migration, including legacy router naming, deprecated endpoint aliasing, and compatibility response/schema wording.

## Solution
Completed a backend API SMAPS-only cleanup by switching to a SMAPS router module, removing deprecated ASAM response compatibility fields, and normalizing schema context guidance text.

## Changes
- Added SMAPS-native incidents router and removed legacy ASAM router module:
  - Added `backend/api/routers/smaps.py`
  - Deleted `backend/api/routers/asam.py`
- Updated API router wiring:
  - `backend/api/main.py` now imports and mounts `smaps.router`
- Removed deprecated maritime risk compatibility field from response payload:
  - `backend/api/routers/maritime.py` removed `asam_max_score`
- Updated AI analyst schema context to SMAPS terminology and endpoint names:
  - `backend/api/services/schema_context.py`
  - `entity_type` scope key updated from `asam` to `smaps`
  - `/api/asam/incidents` references updated to `/api/smaps/incidents`
- Updated maritime risk unit-test wording/helper naming from ASAM to SMAPS:
  - `backend/api/tests/test_maritime_risk.py`

## Verification
- Ran targeted backend API verification:
  - `cd backend/api && python -m ruff check . && python -m pytest`
- Result: pass (`ruff` clean, 46 tests passed).

## Benefits
- Removes backend ASAM compatibility drift and clarifies SMAPS as canonical API vocabulary.
- Reduces ambiguity between frontend and backend contracts.
- Keeps runtime behavior intact while simplifying maintenance.
