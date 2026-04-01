# 2026-04-01-fix-tak-clausalizer-runtime-module-not-found

## Issue
The `sovereign-tak-clausalizer` service failed to start with `ModuleNotFoundError: No module named 'aiokafka'`, despite the dependency being present in `pyproject.toml`.

## Solution
Fixed the `Dockerfile` to properly use the virtual environment created by `uv`. Added `WORKDIR /app` and set `UV_PROJECT_ENVIRONMENT=/opt/venv` to ensure dependencies are installed in a predictable location. Updated the `CMD` to use `uv run --no-sync` which correctly handles the virtual environment during execution.

## Changes
- `backend/ingestion/tak_clausalizer/Dockerfile`: [MODIFY] Added `WORKDIR`, `ENV` configuration for `uv`, and updated `CMD`.

## Verification
- Rebuilt container with `docker compose up -d --build sovereign-tak-clausalizer`.
- Verified logs show successful startup: "TAK Clausalizer Service running...".

## Benefits
Ensures the service reliably uses its isolated dependency environment in Docker.
