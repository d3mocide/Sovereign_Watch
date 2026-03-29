## Issue

The SMAPS feed is no longer a practical runtime dependency because upstream browser-blocking makes reliable ingestion unlikely without a proxy or access workaround the project should not pursue.

## Solution

Sunset SMAPS as an active runtime feature while keeping compatibility surfaces stable enough that the rest of the UI and API continue to function.

## Changes

- Updated `frontend/src/App.tsx` to stop fetching and passing SMAPS map data.
- Updated `frontend/src/components/widgets/LayerVisibilityControls.tsx` to remove the SMAPS / piracy incidents toggle from hazards controls.
- Updated `frontend/src/layers/composition.ts`, `frontend/src/components/map/TacticalMap.tsx`, and `frontend/src/hooks/useAnimationLoop.ts` to remove active SMAPS layer plumbing from the tactical map runtime.
- Updated `backend/api/routers/maritime.py` so the maritime conditions endpoint no longer queries SMAPS incident data and instead returns empty compatibility values for incident fields.
- Updated `backend/api/routers/smaps.py` to return an empty feature collection as a compatibility route while the feed is sunset.
- Updated `backend/ingestion/infra_poller/main.py` to stop scheduling the SMAPS ingestion loop.
- Removed SMAPS runtime environment wiring from `.env.example` and `docker-compose.yml`.

## Verification

- Planned: `cd frontend && pnpm run lint && pnpm run test`
- Planned: `cd backend/api && python -m ruff check . && python -m pytest`
- Planned: `cd backend/ingestion/infra_poller && python -m ruff check . && python -m pytest`

## Benefits

- Removes a brittle upstream dependency from active runtime behavior.
- Keeps the maritime conditions panel and backend contract operational without stale incident data.
- Avoids building or operating a proxy path for a blocked third-party source.