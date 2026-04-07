# Release - v0.66.0 - Clausal Intelligence & Dashboard Overhaul

## Summary

v0.66.0 activates the Clausal Chain behavioral intelligence layer end-to-end, ships the ClausalView right-sidebar, and overhauls the Dashboard with a live Active Conflict Zones widget and a restructured bottom-bar layout. A suite of targeted bug fixes resolves the asyncpg JSONB coercion crash that silently blocked all clausal data, a frontend entity-selection race condition, and WebSocket proxy reliability for remote deployments. Domain intelligence is consolidated from the map context menu into the entity-aware AIAnalystPanel, removing UI clutter and ensuring AI analysis always runs against a fully-resolved tracked entity.

## Key Features

- **Clausal Chain Layer — Live**: The clausal chain visualization is now fully operational. Events are color-coded by anomaly reason (EMERGENCY → red, TYPE_CHANGE → red, ALTITUDE_CHANGE → orange, SPEED_TRANSITION → amber, LOITER_DETECTED → yellow), halo alpha scales with confidence, and clicking any event dot opens a dedicated `ClausalView` right-sidebar panel. A 1h / 6h / 24h lookback sub-filter (default 6h) is available in the Map Layers panel under Analysis.
- **ClausalView Sidebar**: Entity-detail panel showing confidence bar, telemetry grid (time / speed / altitude / course), chain narrative, and anomaly classification badge. Can trigger the AI Analyst directly from the panel.
- **Active Conflict Zones Widget**: New `ActiveConflictWidget` on the dashboard — polls `/api/gdelt/actors` every 5 minutes and surfaces CRITICAL/ELEVATED threat actors with event count, material conflict indicator, and Goldstein score.
- **Domain Intelligence Consolidation**: Air / Sea / Orbital Intel buttons removed from the right-click map menu. Domain analysis is now exclusively available through the AIAnalystPanel when an entity is selected, with the RUN button label dynamically adapting to the entity type.
- **SpaceWeatherPanel — NOAA Scale Badges & Suppression Banner**: The orbital map's Space Weather HUD now fetches `/api/space-weather/alerts` and renders color-coded R / S / G scale badges (level 0 green → level 1 amber → level 2 orange → levels 3–5 red/dark-red). An amber suppression banner appears prominently when signal-loss suppression is active, showing the reason and expiry time.
- **SatnogsView — Active Transmitters & Recent Observations**: The SatNOGS sidebar panel gained two collapsible sections: Active_Transmitters (sat name, mode, downlink frequency from `/api/satnogs/transmitters`) and Recent_Observations (time, NORAD ID, vetted status, frequency, mode from `/api/satnogs/observations` filtered by station ID, last 24h).
- **NWSAlertsWidget — Tactical Map HUD**: National Weather Service alerts now surface as a floating glass widget on the Tactical Map (top-left). AOT-filtered severity counts (Extreme / Severe / Moderate / Minor) are shown collapsed; expanding reveals a scrollable per-alert list with event type, expiry, and headline. Fires intel-feed events for newly detected Severe/Extreme AOT alerts with a 30-minute re-notify debounce.

## Technical Details

### New Files
- `frontend/src/components/widgets/ActiveConflictWidget.tsx` — GDELT-powered active conflict zones dashboard widget
- `frontend/src/components/layouts/sidebar-right/ClausalView.tsx` — clausal state-change entity detail sidebar
- `frontend/src/components/map/SpaceWeatherPanel.tsx` — orbital HUD with Kp gauge, sparkline, NOAA R/S/G badges, suppression banner
- `frontend/src/components/widgets/NWSAlertsWidget.tsx` — tactical map NWS alert HUD with AOT filtering and intel-feed integration

### Notable Changes
- `MapContextMenu.tsx`: Operator domain intel buttons removed; neutral dark border/shadow replacing green glow.
- `AIAnalystPanel.tsx`: Dynamic `domainLabel` reflects active entity domain (Air / Sea / Orbital / Tactical).
- `App.tsx` / `TacticalMap.tsx` / `OrbitalMap.tsx`: `onAnalyzeDomain` prop chain and `domainAnalysisUi` panel fully removed.
- `DashboardView.tsx`: Bottom-row center column swapped from `RFSiteSearchPanel` to `OutageAlertPanel`; right column swapped from `OutageAlertPanel` to `ActiveConflictWidget`.
- `OutageAlertPanel.tsx`: List now renders as a two-column grid.
- `useEntitySelection.ts`: `handleEntityLiveUpdate` uses functional `setSelectedEntity` with entity-type guard, preventing live telemetry from overwriting synthetic (clausal / cluster) selections.
- `ai_router.py`: `_parse_adverbial_context()` helper handles asyncpg JSONB-as-string; resolves repeating `dictionary update sequence element #0 has length 1` error on `/api/ai_router/clausal-chains`.
- `nginx.conf` / `nginx-dev.conf`: Explicit `Host` + `Connection` proxy headers on `/ws/` for remote-host WebSocket stability. Remote deployments require `ALLOWED_ORIGINS` in `.env` and `sovereign-backend` rebuild.
- `SatnogsView.tsx`: Added Active_Transmitters and Recent_Observations collapsible sections; fetches live data from `/api/satnogs/transmitters` and `/api/satnogs/observations` with station-scoped filtering.
- `SpaceWeatherPanel.tsx`: Polls `/api/space-weather/alerts`; renders `scaleColor()`-keyed R/S/G badges and conditional suppression banner alongside the existing Kp gauge and sparkline.
- `NWSAlertsWidget.tsx`: Floating tactical map widget; consumes the `nwsAlerts` GeoJSON prop already loaded by `TacticalMap`, applies `alertIntersectsAOT()` filtering, and fires `onEvent()` for new Severe/Extreme alerts.

### Test Coverage
- 36/36 frontend tests pass
- Frontend lint clean (`pnpm run lint`)
- Backend ruff clean; all pytest tests pass

## Upgrade Instructions

```bash
# Pull latest
git pull origin main

# Nginx config changed — rebuild proxy
docker compose up -d --build sovereign-nginx

# (Remote deployments only) Add your host IP to ALLOWED_ORIGINS in .env, then:
docker compose up -d --build sovereign-backend

# Frontend hot-reload picks up changes automatically in dev;
# production rebuild:
docker compose up -d --build sovereign-frontend
```
