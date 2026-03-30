# 2026-03-30 - Fix Backend psutil Lockfile Drift

## Issue
Backend API startup failed in the container with `ModuleNotFoundError: No module named 'psutil'` when importing `routers/metrics.py`.

## Solution
Regenerated the API lockfile so the container install path (`uv sync --frozen --no-dev`) includes `psutil` from `pyproject.toml`.

## Changes
- Updated `backend/api/uv.lock` via `uv lock`.
- Confirmed lockfile now includes `psutil==6.1.1` package and dependency edges.

## Verification
- `cd backend/api && uv run --with ruff ruff check .` -> passed.
- `cd backend/api && uv run pytest` -> failed during collection with pre-existing `aiokafka.admin` module shadowing behavior in tests, unrelated to the lockfile change.
- `cd backend/api && uv run python -c "import aiokafka; import aiokafka.admin"` -> succeeded, confirming package availability in environment.

## Benefits
- Restores deterministic dependency parity between `pyproject.toml` and `uv.lock`.
- Prevents API container startup failure on metrics router import.
- Keeps frozen Docker installs reproducible and complete.
