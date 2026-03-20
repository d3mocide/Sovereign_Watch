# 2026-03-20 - FCC Tower Enrichment: Height, Elevation, Owner

## Issue
FCC tower records in `infra_towers` had `height_m`, `elevation_m`, and `owner` always NULL.
The ingestion only read `CO.dat` (coordinates), and the comments explicitly noted the other fields
were "not in CO.dat new schema". Live API verification confirmed 0 non-null values across 10,000
sampled records.

## Root Cause
The r_tower.zip contains six .dat files. The poller was only reading `CO.dat` for lat/lon. The
data needed for the three fields lives in two other tables in the same zip:

| Field | Source file | Column |
|---|---|---|
| `owner` | `EN.dat` | col[9] — registered entity name |
| `elevation_m` | `RA.dat` | col[28] — ground elevation AMSL (metres) |
| `height_m` | `RA.dat` | col[30] — structure height above ground (metres) |

All three files key on `fcc_id` at col[2].

## Solution
Parse `EN.dat` and `RA.dat` in-memory inside the same `with zipfile.ZipFile` block, build
lookup dicts keyed by `fcc_id`, then join into the CO.dat coordinate records before upsert.

## Changes
- `backend/ingestion/infra_poller/main.py`:
  - Added `_parse_float(s)` helper for safe float parsing of FCC pipe-delimited fields.
  - `fetch_and_ingest_fcc_towers()` now parses EN.dat → `owner_by_id` dict and RA.dat →
    `ra_by_id` dict before processing CO.dat.
  - Record tuple extended from 5 fields to 6: `(fcc_id, lat, lon, elev_m, height_m, owner)`.
  - Upsert INSERT column list and ON CONFLICT DO UPDATE SET both updated to include `owner`.
  - f-string geometry literal replaced with `.format()` to avoid ambiguity with the 6-tuple.

## Verification
- Confirmed r_tower.zip schema by downloading the live archive and inspecting all .dat files.
- Verified EN.dat col[9] contains entity names (e.g. `GTE MOBILNET OF OHIO LIMITED PARTNERSHIP`).
- Verified RA.dat col[28]/col[30] contain numeric height/elevation values (e.g. `86.8`, `91.1`).
- Python `ast.parse` syntax check: PASS.
- No ruff binary in environment; no ruff errors expected (no new imports, standard Python patterns).

## Notes
- The `infra_towers` schema already had `owner TEXT` and `height_m`/`elevation_m` columns;
  no DB migration required.
- The next scheduled weekly FCC sync will populate all existing rows via the upsert ON CONFLICT path.
- EN.dat ~369K rows, RA.dat ~195K rows — both fit comfortably in memory for this batch job.
