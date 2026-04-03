# 2026-04-03 Maritime AIS No-Data Timeout Status

## Issue
The System Health widget could show Maritime AIS as PENDING indefinitely when AISStream accepted the websocket connection but delivered no frames. This looked like a silent failure and provided no operator signal about recovery behavior.

## Solution
Implemented a no-data timeout state in the maritime poller and surfaced it through the poller-health API and frontend widgets.

- Poller detects prolonged connected-but-silent AIS streams.
- Poller records a structured `no_data_timeout` error and reconnects with existing cooldown/backoff logic.
- Poller auto-clears the no-data error when AIS frames resume.
- API maps the structured maritime no-data error to a distinct `no_data` status.
- Frontend renders `no_data` as `NO DATA` with amber status styling.

## Changes
- backend/ingestion/maritime_poller/service.py
  - Added `NO_DATA_TIMEOUT_SECONDS` and `NO_DATA_ERROR_CODE` constants.
  - Added no-data tracking state (`last_data_received_at`).
  - Added helpers:
    - `_write_heartbeat` (throttled Redis heartbeat updates)
    - `_record_no_data_timeout` (structured Redis error payload)
    - `_clear_no_data_error` (self-heal on resumed traffic)
  - Updated stream loop behavior:
    - Tracks last frame received timestamp.
    - Updates heartbeat for PositionReport, StandardClassBPositionReport, ShipStaticData, and StaticDataReport.
    - Forces reconnect with backoff after prolonged no-frame interval.

- backend/api/routers/system.py
  - Extended poller-health status derivation to map error payload `code == "no_data_timeout"` to `no_data`.

- frontend/src/components/stats/types.ts
  - Added `no_data` to `PollerHealth.status` union.

- frontend/src/components/widgets/SystemHealthWidget.tsx
  - Added `no_data` status handling in icon, label (`NO DATA`), and color mapping.

- frontend/src/components/stats/PollerHealthSidebar.tsx
  - Added `no_data` color mapping and explicit `NO DATA` label rendering.

## Verification
- Backend API lint:
  - `cd backend/api && uv tool run ruff check .` (pass)
- Maritime poller lint:
  - `cd backend/ingestion/maritime_poller && uv tool run ruff check .` (pass)
- Backend API tests:
  - `cd backend/api && uv run python -m pytest` (58 passed)
- Maritime poller tests:
  - `cd backend/ingestion/maritime_poller && uv run python -m pytest` (91 passed)
- Frontend checks:
  - `cd frontend && pnpm run lint && pnpm run test` (pass, 36 tests)

## Benefits
- Operators can distinguish silent upstream AIS data stalls from normal startup pending state.
- System now self-recovers from no-frame periods using cooldown reconnect behavior.
- Health UI provides clear, actionable status (`NO DATA`) and auto-recovers to healthy once traffic resumes.
