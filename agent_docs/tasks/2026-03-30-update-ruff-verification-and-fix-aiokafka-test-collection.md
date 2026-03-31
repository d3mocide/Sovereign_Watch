# 2026-03-30 - Update Ruff Verification and Fix aiokafka Test Collection

## Issue
1. Verification guidance used direct `ruff check .` commands, but `ruff` is not always available as a project dependency in this environment.
2. Backend test collection failed with `ModuleNotFoundError: No module named 'aiokafka.admin'; 'aiokafka' is not a package` because some tests mocked only `aiokafka` and not `aiokafka.admin`.
3. After fixing collection, auth tests exposed a `passlib` + `bcrypt` incompatibility when `bcrypt==5.x` was resolved.

## Solution
1. Standardized Python lint verification commands to `uv tool run ruff check .` in agent instruction docs.
2. Updated test stubs to register both `aiokafka` and `aiokafka.admin` where needed.
3. Pinned `bcrypt` to a passlib-compatible version and regenerated lockfile.
4. Consolidated repeated dependency stub boilerplate into a shared helper used by backend API tests.

## Changes
- Updated verification command tables/examples:
  - `AGENTS.md`
  - `CLAUDE.md`
- Fixed test stubs:
  - `backend/api/tests/test_auth.py`
  - `backend/api/tests/test_cors.py`
  - `backend/api/tests/test_maritime_risk.py`
  - `backend/api/tests/test_stats.py`
  - `backend/api/tests/test_tracks_replay.py`
  - `backend/api/tests/test_tracks_validation.py`
- Added shared test helper:
  - `backend/api/test_stubs.py`
- Dependency and lock sync:
  - `backend/api/pyproject.toml` (`bcrypt==4.2.1`)
  - `backend/api/uv.lock` regenerated

## Verification
- `cd backend/api && uv tool run ruff check .` -> passed
- `cd backend/api && uv run python -m pytest` -> passed (`56 passed`)

## Benefits
- Eliminates recurring first-pass lint failures caused by unavailable direct `ruff` executable.
- Fixes flaky import-time test collection failure around `aiokafka.admin`.
- Restores stable auth hashing behavior with passlib by pinning bcrypt to a compatible release.
- Reduces duplicated mocking code across tests and lowers risk of future drift between test files.
