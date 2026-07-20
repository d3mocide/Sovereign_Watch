# Pre-Release Report: v1.1.3

## Issue

Evaluate release readiness for pending changes since `v1.1.2` under the `pre-release` skill workflow and decision gate.

## Candidate Scope

Commits evaluated (`v1.1.2..HEAD`):
- `64a5e95`: ⚡ Vectorize topocentric conversion in pass prediction
- `2bd71d7`: Fix TimescaleDB CPU/memory/IO spike (query type bug, PG tuning, ISS chunking)
- `b58e7a3`: Fix JS8Call image build: bump JS8Call-improved AppImage to v3.0.3
- `7be40d0`: Activate LiteLLM Router fallbacks; give hourly_clausal_summaries a consumer
- `59688fa`: Replace proxy heuristics in domain agents; remove dead clausalizer batch code
- `7f168c1`: Fix inert correlation legs in clausal-chain and risk-scoring pipeline

## Verification Summary

All targeted test suites executed cleanly across modified components:

- **Backend API**: `cd backend/api && uv tool run ruff check . && uv run python -m pytest` -> **Passed** (247 tests passed).
- **Space Pulse Poller**: `cd backend/ingestion/space_pulse && uv tool run ruff check . && uv run python -m pytest` -> **Passed** (64 passed, 1 skipped).
- **Infrastructure Poller**: `cd backend/ingestion/infra_poller && uv tool run ruff check . && uv run python -m pytest` -> **Passed** (88 passed).
- **TAK Clausalizer**: `cd backend/ingestion/tak_clausalizer && uv tool run ruff check . && uv run python -m pytest` -> **Passed** (51 passed; updated `asyncpg` to `0.31.0` for Python 3.14 compatibility).
- **JS8Call Service**: `cd js8call && uv tool run ruff check . && uv run python -m pytest` -> **Passed** (26 passed).
- **Frontend**: Zero modifications post `v1.1.2` (verified with `git diff v1.1.2..HEAD -- frontend/`).

## Audit Checks

- **Changelog**: Complete. Populated `[Unreleased]` in `CHANGELOG.md` with operator-facing entries for all fixes and optimizations.
- **Task Log Coverage**: Complete. Created missing task doc `agent_docs/tasks/2026-07-17-bolt-vectorize-topocentric-pass-prediction.md`.
- **Migration & Schema Check**: Pass. `V006__iss_positions_daily_chunks.sql` is present under `backend/db/migrations/`, and `06_critical_infrastructure.sql` updated in tandem for fresh installs. No illegal post-deploy schema edits made without migration.

## Pre-Release Decision Gate

- **Risk Level**: Medium (Database hypertable migration `V006` and LiteLLM fallback routing, but fully verified and backward-compatible).
- **Decision**: **GO**
- **Recommendation**: **RELEASE NOW (v1.1.3)**
  - Operator-facing data correctness and critical database stability issues are resolved (TimescaleDB CPU thrash, clausal-chain multi-INT correlation fixes, LiteLLM fallback activation, dark vessel real FIRMS cross-referencing).
