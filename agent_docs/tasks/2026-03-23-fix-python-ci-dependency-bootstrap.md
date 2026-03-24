# Python CI Dependency Bootstrap

## Issue

The Python CI jobs were installing manually curated package lists instead of installing each service from its own `pyproject.toml`. That drifted out of sync for the Backend API, Aviation Poller, Space Pulse, and Infrastructure Poller, causing CI failures even though the suites passed when run with the services' declared dependencies.

## Solution

Updated every Python test job in `.github/workflows/ci.yml` to install the local project in editable mode from its service directory and then add only the small set of test-only packages needed for that suite. This keeps runtime dependency resolution tied to the source of truth for each component while preserving the existing per-job test commands.

## Changes

### `.github/workflows/ci.yml`

- Replaced manual `pip install` package lists with `python -m pip install -e . ...` in all Python jobs.
- Scoped each install step to the service directory so `pip` reads the correct local `pyproject.toml`.
- Kept the existing `pytest` entrypoints unchanged.

Affected jobs:

- `backend-api`
- `aviation-poller`
- `maritime-poller`
- `rf-pulse`
- `space-pulse`
- `infra-poller`
- `gdelt-pulse`
- `js8call`

## Verification

- `backend/api`: `python -m pytest tests -v` -> 23 passed
- `backend/ingestion/aviation_poller`: `python -m pytest tests -v` -> 143 passed
- `backend/ingestion/space_pulse`: `python -m pytest tests -v` -> 15 passed
- `backend/ingestion/infra_poller`: `python -m pytest tests -v` -> 24 passed

## Benefits

- Prevents CI from missing runtime dependencies that are already declared by each service.
- Reduces maintenance overhead by removing duplicated dependency pin sets from the workflow.
- Improves future reliability for the other Python jobs that had the same drift risk, even if they had not failed yet.
