## Issue
CelesTrak is migrating consumers away from legacy fixed-width TLE transport, but `space_pulse` orbital ingestion was still pulling `gp.php?GROUP=...&FORMAT=TLE` text and parsing 3-line element sets directly. That left the poller on the legacy feed path and exposed future compatibility risk as CelesTrak continues standardizing on modern OMM payloads.

## Solution
Migrated the orbital feed transport in `space_pulse` from legacy TLE text to CelesTrak OMM CSV while preserving the existing SGP4 propagation pipeline. The poller now fetches `FORMAT=CSV`, parses OMM records with `sgp4.omm.parse_csv`, initializes `Satrec` objects through `sgp4.omm.initialize`, and continues publishing the same propagated orbital events downstream.

## Changes
- Updated `backend/ingestion/space_pulse/sources/orbital.py`
  - Switched CelesTrak fetches from `FORMAT=TLE` to `FORMAT=CSV`.
  - Replaced raw TLE parsing with OMM CSV parsing using `sgp4.omm`.
  - Preserved downstream metadata needed for propagation and TAK event publication while replacing raw TLE line storage with OMM fields (`OBJECT_ID`, `EPOCH`).
  - Moved orbital cache filenames to `.omm.csv` to avoid re-reading stale legacy TLE cache files after deploy.
  - Updated logging/messages to reflect orbital/OMM terminology instead of TLE-specific wording.
- Updated `backend/ingestion/space_pulse/tests/test_orbital.py`
  - Replaced TLE fixtures with an OMM CSV fixture.
  - Added focused coverage for valid OMM parsing, category mapping, invalid-row handling, and OMM cache priming.
- Updated `CHANGELOG.md`
  - Added an Unreleased entry describing the CelesTrak orbital feed migration.

## Verification
- `cd backend/ingestion/space_pulse && uv run python -m pytest tests/test_orbital.py -v`
  - Result: 9 passed.
- `cd backend/ingestion/space_pulse && uv tool run ruff check .`
  - Result: passed.
- `cd backend/ingestion/space_pulse && uv run python -m pytest tests/test_satnogs_db.py tests/test_satnogs_network.py tests/test_space_weather.py -v`
  - Result: 16 passed.
- Attempted full poller suite with `uv tool run ruff check . && uv run python -m pytest`.
  - Ruff passed and pytest advanced through `test_firms.py` and `test_orbital.py` without failures before the terminal session stopped surfacing final completion output, so the focused slice verification above was used to fully validate the touched code path.

## Benefits
- Removes dependence on legacy TLE transport for orbital ingestion.
- Aligns `space_pulse` with CelesTrak’s modern OMM feed direction while retaining SGP4 compatibility.
- Avoids future breakage from legacy TLE-specific constraints and stale cache reuse.
- Keeps downstream orbital propagation and TAK publication behavior stable during the feed migration.