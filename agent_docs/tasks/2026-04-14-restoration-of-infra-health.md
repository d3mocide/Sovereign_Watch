## Issue
Critical infrastructure telemetry (ISS, Ocean Buoys, Weather Alerts) was showing as `PENDING` in the HUD due to missing polling loops and misaligned health-reporting keys in Redis. Additionally, the News Aggregator lacked tactical feeds and a real-time health pulse.

## Solution
Implemented the missing ISS tracking loop, expanded the News aggregator with tactical sources, and synchronized all infrastructure heartbeats to the shared System Health registry.

## Changes

### Ingestion (InfraPoller)
- **ISS Tracking**: Implemented a 5-second polling loop in `backend/ingestion/infra_poller/main.py` that fetches live coordinates and persists them to the `iss_positions` hypertable.
- **Heartbeat Alignment**: Updated `ndbc_loop`, `nws_loop`, and `iss_loop` to report successful fetches to Redis using the keys expected by the Health HUD.
- **Resilience**: Resolved a database constraint issue where the ISS hypertable was rejecting ingestion due to missing unique index requirements on `ON CONFLICT` clauses.

### Backend API
- **Tactical News Expansion**: Added UN News, Defense News, The Aviationist, and Reuters World to the default RSS rotation in `backend/api/routers/news.py`.
- **News Heartbeat**: Updated the News router to set `news:last_fetch` on every request (cached or fresh), ensuring the HUD accurately reflects aggregator availability.
- **System Health Registry**: Registered `news` (News Aggregator) and refined various infrastructure entries in `backend/api/routers/system.py`.

### UI / HUD
- **Consolidated Health HUD**: Implemented a high-density, 2-column grid-based System Health widget (via `SystemHealthWidget.tsx`) that eliminates scrolling and improves operational scan-ability.

## Verification
- **Redis Health Check**: Verified `infra:last_*` and `news:last_fetch` heartbeats are actively pulse-updating.
- **Service Logs**: Confirmed `sovereign-infra-poller` is successfully ingesting ISS and NDBC streams without errors.
- **Backend Lint**: `uv tool run ruff check .` passed.
- **Frontend Build**: `pnpm run typecheck` passed.

## Benefits
- Restores 100% visibility into the data fusion pipeline's external triggers.
- Improves tactical awareness with high-cadence ISS tracking and a defense-oriented news feed.
- High-density HUD keeps the system state "always visible" for the operator.
