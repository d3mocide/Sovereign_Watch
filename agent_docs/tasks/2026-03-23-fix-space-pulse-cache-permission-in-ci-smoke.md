# Fix Space Pulse Cache Permission In CI Smoke

## Issue

The `space-pulse` smoke test failed in GitHub Actions during test collection with:

- `PermissionError: [Errno 13] Permission denied: '/app'`

Root cause:

- `backend/ingestion/space_pulse/sources/orbital.py` created `/app/cache` at import time.
- GitHub runners do not permit writing to `/app`, so import failed before tests executed.

## Solution

Made orbital cache path configurable and resilient:

- Added `SPACE_PULSE_CACHE_DIR` env override support.
- Added a permission-safe fallback to `/tmp/space_pulse_cache` when the configured path is not writable.
- Updated CI smoke workflow to set `SPACE_PULSE_CACHE_DIR` to a writable path in the `space-pulse` smoke step.

## Changes

### `backend/ingestion/space_pulse/sources/orbital.py`

- Replaced hardcoded cache path initialization with:
  - `CACHE_DIR = os.getenv("SPACE_PULSE_CACHE_DIR", "/app/cache")`
- Wrapped cache directory creation with `try/except PermissionError`.
- On permission error, fallback to `/tmp/space_pulse_cache` and log a warning.

### `.github/workflows/ci.yml`

- Added step env for `Space pulse smoke`:
  - `SPACE_PULSE_CACHE_DIR: /tmp/space_pulse_cache`

## Verification

- Ran `python -m pytest tests/test_orbital.py -q` in `backend/ingestion/space_pulse` locally.
- No import-time permission error observed.

## Benefits

- Prevents CI smoke failures caused by environment-specific filesystem permissions.
- Preserves default container behavior while making local/CI execution robust.
- Keeps smoke checks fast and deterministic across runtime environments.
