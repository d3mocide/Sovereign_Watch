# Test Coverage Improvements & CI Pipeline

## Issue

The repository had significant gaps in test coverage and no CI/CD pipeline to enforce quality checks on pull requests. Specifically:

- **RF Pulse tests** (`test_repeaterbook.py`, `test_noaa_nwr.py`, `test_ard.py`) contained only placeholder `assert True` stubs — no real assertions.
- **GDELT Pulse** had zero test files despite having a non-trivial CSV/ZIP parsing service with real business logic.
- **No CI/CD pipeline** existed. Tests were never automatically run against PRs, meaning regressions could be merged silently.
- Several services (`rf_pulse`, `maritime_poller`, `infra_poller`, `space_pulse`) had no `[dependency-groups]` dev section in their `pyproject.toml`.

## Solution

1. Created a GitHub Actions CI workflow that runs all test suites on every push to `main` and on every pull request. This gives a quality gate that must pass before a PR can be merged.
2. Replaced the three RF pulse placeholder tests with comprehensive unit tests covering the `_normalise()` methods and HTTP-level integration logic.
3. Added the first-ever test suite for the GDELT Pulse service, covering its TSV/ZIP parsing logic.
4. Added `[dependency-groups] dev` sections to the four `pyproject.toml` files that were missing them.

## Changes

### `.github/workflows/ci.yml` (new)
- Triggers on `push` to `main` and on `pull_request` targeting `main`.
- Nine parallel jobs: `frontend`, `backend-api`, `aviation-poller`, `maritime-poller`, `rf-pulse`, `space-pulse`, `infra-poller`, `gdelt-pulse`, `js8call`.
- Each job installs only the minimal set of test dependencies via `pip install`, then runs `pytest tests/ -v`.
- Frontend job uses pnpm + Vitest (`pnpm run lint` + `pnpm run test --run`).

### `backend/ingestion/rf_pulse/tests/test_repeaterbook.py` (replaced placeholder)
- 11 tests for `RepeaterBookSource._normalise()`:
  - Valid full entry, zero-coord rejection, invalid-coord rejection, missing-coord rejection.
  - Emcomm flags (present/absent), multiple modes, CTCSS from PL/CTCSS fields, zero CTCSS, invalid frequencies, site_id format.

### `backend/ingestion/rf_pulse/tests/test_noaa_nwr.py` (replaced placeholder)
- 3 async tests for `NOAANWRSource._fetch_and_publish()` using mocked `aiohttp.ClientSession`:
  - Deduplication of duplicate callsigns, record structure validation, zero-coordinate skipping.

### `backend/ingestion/rf_pulse/tests/test_ard.py` (replaced placeholder)
- 12 tests for `ARDSource._normalise()`:
  - Valid entry, zero/None/invalid coordinates, closed/off-air status, emcomm flags, CTCSS, invalid frequencies, site_id fallback, meta fields.

### `backend/ingestion/gdelt_pulse/tests/test_gdelt.py` (new)
- 8 tests for `GDELTPulseService.fetch_and_parse()` using mocked aiohttp + aiokafka:
  - Publishes valid rows, skips short rows, skips empty lat/lon, skips invalid lat/lon, validates enriched fields, handles multiple rows, returns early on HTTP error, handles missing optional fields with defaults.

### `pyproject.toml` files updated
- `backend/ingestion/rf_pulse/pyproject.toml` — added `[dependency-groups] dev` with pytest 9.0.2 and pytest-asyncio 1.3.0.
- `backend/ingestion/maritime_poller/pyproject.toml` — added `[dependency-groups] dev` with pytest 9.0.2.
- `backend/ingestion/infra_poller/pyproject.toml` — added `[dependency-groups] dev` with pytest 9.0.2.
- `backend/ingestion/space_pulse/pyproject.toml` — added `[dependency-groups] dev` with pytest 9.0.2, sgp4, numpy.

## Verification

All new and existing tests were run locally:

```
# RF Pulse — 26 passed
cd backend/ingestion/rf_pulse && python -m pytest tests/ -v

# GDELT Pulse — 8 passed
cd backend/ingestion/gdelt_pulse && python -m pytest tests/ -v

# Maritime Poller — 91 passed (regression check)
cd backend/ingestion/maritime_poller && python -m pytest tests/ -v
```

## Benefits

- **PR gate**: Every pull request now triggers the full test suite. Failures block merging.
- **Coverage**: RF Pulse goes from 3 placeholder stubs → 26 real tests. GDELT Pulse goes from 0 → 8 tests.
- **Consistency**: All services now declare dev dependencies in `pyproject.toml`.
- **Fast feedback**: Nine parallel CI jobs run independently, minimising total wait time per PR.
