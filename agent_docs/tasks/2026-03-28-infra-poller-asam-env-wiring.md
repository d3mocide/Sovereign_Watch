# 2026-03-28 - Infra Poller ASAM Env Wiring

## Issue
`infra_poller` read NDBC/ASAM runtime knobs from environment in code, but the variables were not exposed in `docker-compose.yml` or documented in `.env.example`. Additionally, `POLL_INTERVAL_ASAM_DAYS` was defined but not used in runtime gating.

## Solution
Wired NDBC/ASAM variables through Docker Compose and `.env.example`, made `ASAM_URL` configurable in code, and enforced `POLL_INTERVAL_ASAM_DAYS` as a minimum successful-ingest interval.

## Changes
- Updated `backend/ingestion/infra_poller/main.py`:
  - `ASAM_URL` now loads from `ASAM_URL` env var with legacy endpoint default.
  - `POLL_INTERVAL_ASAM_DAYS` now loads from env var.
  - `asam_loop` now enforces an interval gate using Redis key `asam:last_ingest_ts` plus existing weekday/hour/day protections.
- Updated `docker-compose.yml` (`sovereign-infra-poller` service env):
  - Added `POLL_INTERVAL_NDBC_MINUTES`
  - Added `ASAM_URL`
  - Added `ASAM_TRIGGER_HOUR_UTC_START`
  - Added `ASAM_TRIGGER_HOUR_UTC_END`
  - Added `POLL_INTERVAL_ASAM_DAYS`
- Updated `.env.example` with matching variables and operational comments.

## Verification
- Ran targeted infra poller checks:
  - `cd backend/ingestion/infra_poller && ruff check . && python -m pytest`

## Benefits
- Compose/runtime parity for infra poller tuning variables.
- Faster operational control of ASAM/NDBC behavior without code changes.
- Eliminates dead config (`POLL_INTERVAL_ASAM_DAYS`) by enforcing it at runtime.
