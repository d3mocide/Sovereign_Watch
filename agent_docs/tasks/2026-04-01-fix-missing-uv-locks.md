# 2026-04-01-fix-tak-clausalizer-build-missing-uv-lock

## Issue
Docker build for `sovereign-tak-clausalizer` failed because the Dockerfile expects `uv.lock` to be copied, but the file was missing in the build context.

## Solution
Generated the missing `uv.lock` files for `sovereign-tak-clausalizer` using `uv lock`. Also generated the lockfile for `sovereign-gdelt-pulse` for consistency.

## Changes
- `backend/ingestion/tak_clausalizer/uv.lock`: [NEW] Generated lockfile.
- `backend/ingestion/gdelt_pulse/uv.lock`: [NEW] Generated lockfile.

## Verification
- Confirmed that `uv.lock` exists in `backend/ingestion/tak_clausalizer/`.
- Confirmed that `uv.lock` exists in `backend/ingestion/gdelt_pulse/`.

## Benefits
Resolves the Docker build failure and ensures deterministic builds for these services.
