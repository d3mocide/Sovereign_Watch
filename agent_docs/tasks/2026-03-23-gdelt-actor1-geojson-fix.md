# Fix: Include `actor1` in GDELT GeoJSON Properties

## Issue

The SQL query in `backend/api/routers/gdelt.py` selected `actor1` from `gdelt_events`, but
the `actor1` field was omitted from the GeoJSON `properties` dict that was returned to the
frontend. As a result the frontend's GDELT view always rendered Actor 1 as missing/empty.

## Solution

Add `"actor1": r["actor1"]` to the `properties` dict, immediately before `"actor2"` to
keep the two actor fields together and consistent with the existing `actor1_country` /
`actor2_country` naming pattern.

## Changes

| File | Change |
|------|--------|
| `backend/api/routers/gdelt.py` | Added `"actor1": r["actor1"]` to the GeoJSON `properties` dict (line 99) |

## Verification

- `ruff check backend/api/` — no new errors introduced (4 pre-existing warnings in
  unrelated files).

## Benefits

- Frontend GDELT views can now correctly display Actor 1 for each event.
- The GeoJSON response is now consistent: both `actor1` and `actor2` are present alongside
  their respective country fields.
