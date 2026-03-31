# 2026-03-30 - JSW Auth Compose and Lock Sync

## Issue
New JSW auth-related variables were added to `.env.example`, but they were not passed into the `sovereign-backend` service in `docker-compose.yml`. Also, backend auth dependencies added to `backend/api/pyproject.toml` needed to be reflected in `backend/api/uv.lock`.

## Solution
1. Added the missing auth environment variable passthroughs to `sovereign-backend` in compose.
2. Regenerated `backend/api/uv.lock` from the current `pyproject.toml` dependency set.

## Changes
- Updated `docker-compose.yml`:
  - Added `AUTH_ENABLED`
  - Added `JWT_SECRET_KEY`
  - Added `JWT_ALGORITHM`
  - Added `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`
  - Added `BOOTSTRAP_ADMIN_USERNAME`
  - Added `BOOTSTRAP_ADMIN_PASSWORD`
- Updated `backend/api/uv.lock` via `uv lock`:
  - Added auth dependency graph including: `python-jose`, `passlib`, `python-multipart`, `bcrypt`, `cryptography`, `ecdsa`, `rsa`, `pyasn1`, `cffi`, `pycparser`, `six`

## Verification
- `cd backend/api && uv tool run ruff check .` -> passed
- `cd backend/api && uv run python -m pytest` -> failed during test collection with:
  - `ModuleNotFoundError: No module named 'aiokafka.admin'; 'aiokafka' is not a package`
  - Failure surfaced in `tests/test_auth.py` and `tests/test_cors.py` while importing `routers/metrics.py`

## Benefits
- JSW auth runtime configuration is now correctly injectable through compose-backed deployments.
- Backend lockfile now matches declared dependencies, preventing drift between development and container builds.
