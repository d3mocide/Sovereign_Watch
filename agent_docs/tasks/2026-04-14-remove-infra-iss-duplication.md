## Issue

ISS polling had been migrated to `space_pulse`, but `infra_poller` still retained a full duplicate ISS runtime loop and an obsolete `POLL_INTERVAL_ISS_SECONDS` configuration surface. That caused duplicate ownership, unnecessary upstream requests to `open-notify`, and confusing runtime errors from the wrong container.

## Solution

Removed the ISS runtime path from `infra_poller` entirely so `space_pulse` is the only container responsible for ISS ingestion and Redis publication.

## Changes

- Updated `backend/ingestion/infra_poller/main.py`
  - Removed `iss_loop()` from the service task list.
  - Removed the obsolete ISS polling config constant and Open Notify URL.
  - Removed the dead ISS parsing/upsert runtime path.
  - Repaired a malformed `shutdown()` / `cables_loop()` section so the module imports and verifies cleanly.
- Updated `backend/ingestion/infra_poller/tests/test_peeringdb_iss.py`
  - Removed tests for the deleted ISS helper path; retained PeeringDB helper coverage.
- Updated config surfaces:
  - `docker-compose.yml`
  - `.env.example`
  - `.env`
  - Removed `POLL_INTERVAL_ISS_SECONDS` from `infra_poller` configuration.

## Verification

- Host checks:
  - `cd backend/ingestion/infra_poller && uv tool run ruff check .`
  - `cd backend/ingestion/infra_poller && uv run python -m pytest`
  - Result: passed (`85` tests).
- Container parity:
  - `docker compose -f docker-compose.yml -f compose.dev.yml up -d --build sovereign-infra-poller`
  - `docker compose exec sovereign-infra-poller uv tool run ruff check .`
  - `docker compose exec sovereign-infra-poller uv run python -m pytest`
  - Result: passed (`85` tests).

## Benefits

- Eliminates duplicate ISS polling and upstream noise from `infra_poller`.
- Leaves ISS ownership solely in `space_pulse`, matching the intended architecture.
- Removes a misleading configuration knob that no longer should exist.