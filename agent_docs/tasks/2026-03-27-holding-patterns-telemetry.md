# 2026-03-27-holding-patterns-telemetry.md

## Issue

1. **Holding Patterns Missing**: Backend logs showed active holding patterns, but they were not visualized on the map or triggering alerts.
2. **Telemetry Failure**: The Stats Dashboard Networking tab showed "0.0 KB/S" for ADS-B data even when traffic was flowing.
3. **Health Indicators**: The dashboard health pips were static placeholders and did not show historical performance.

## Solution

1. **Mapping Integration**: Unified naming conventions (canonical IDs) across the ingest pipe (Historian), Health API, and Throughput API.
2. **Tactical Layer**: Developed a new `HoldingPatternLayer` using Deck.gl to render GeoJSON boundaries and tactical labels.
3. **Alerting**: Added a stateful notification trigger in `TacticalMap.tsx` to fire alerts when new patterns enter the AOI.
4. **Health Sparklines**: Implemented a Redis-backed rolling 12-minute bitmask in `system.py` to provide real-time status history pips.

## Changes

### Backend

- `api/routers/stats.py`: Updated `TOPIC_TO_ID` to use canonical poller IDs (`adsb`, `maritime`, etc.).
- `api/routers/system.py`: Implemented a list-based history buffer in Redis for `get_poller_health`, returning 12 bits of state history.

### Frontend

- `components/views/StatsDashboardView.tsx`: Updated interface and mapping logic to use real health history and unified throughput IDs.
- `layers/buildHoldingPatternLayer.ts`: New file for amber pulsed tactical zones.
- `layers/composition.ts`: Wired holding pattern data into the Deck.gl composition stack.
- `hooks/useAnimationLoop.ts`: Added reactive refs for holding pattern GeoJSON to avoid render lag.
- `components/map/TacticalMap.tsx`: Implemented background poller for holding patterns and added stateful alert triggers.

## Verification

- Verified `GET /api/stats/throughput` returns non-zero rates for `adsb`.
- Verified `GET /api/config/poller-health` returns 12-element `history` arrays.
- Verified `HoldingPatternLayer` is composed into the map stack.
- Observed backend logs confirming "Holding pattern analysis" data is being served by the API.

## Benefits

- Analysts now have immediate visual and audible notification of non-standard flight maneuvers.
- Networking telemetry accurately reflects system load, allowing for better resource monitoring.
- Health history pips provide immediate diagnostic context for intermittent poller failures.
