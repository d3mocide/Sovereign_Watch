# Release - v0.53.0 - App Decomposition and Hazard Intelligence

This release sharpens the tactical operator workflow by significantly simplifying frontend orchestration while improving hazard-focused map controls and alert signal quality. The result is a leaner application shell, cleaner layer semantics, and smoother high-frequency animation behavior under sustained load.

### Key Features

- **App.tsx Refactor Completion**: Reduced `App.tsx` from 1,140 lines to 594 lines through extraction of six cohesive hooks: `useViewMode`, `useSidebarState`, `useIntelEvents`, `useAppFilters`, `useEntitySelection`, and `useReplayController`.
- **Hazards Layer Grouping**: Renamed the former "Environmental" layer category to **HAZARDS** to better reflect operational threat indicators (aurora, GPS jamming, holding patterns).
- **Holding Pattern Toggle in Hazards**: Added a dedicated holding-pattern toggle in layer controls, styled in amber to match tactical map visualization.

### Technical Details

- **State Architecture**:
	- `useViewMode`: view mode with localStorage persistence.
	- `useSidebarState`: open/close state for all 5 overlays.
	- `useIntelEvents`: throttled event insertion and hourly feed cleanup.
	- `useAppFilters`: localStorage toggles, URL hash sync, and computed `orbitalFilters`, `tacticalFilters`, `activeServices`, `rfParams`.
	- `useEntitySelection`: selected entity state, history segments, follow mode, NORAD resolution, and select/live-update callbacks.
	- `useReplayController`: replay state, binary-search frame lookup, `requestAnimationFrame` playback loop, and `loadReplayData`.
- **Alert Deduplication Fix**: Holding pattern alerts now dedupe by `hex_id` only, preventing repetitive 30-second re-alerting for the same circling aircraft.
- **Animation Performance Path**:
	- Moved `onHover` in animation composition to a stable callback ref (avoids per-frame callback allocation).
	- Cached JS8 station array materialization (`Array.from(map.values())`) behind a map-size change check.
- **Default Filter Explicitness**: Added `showHoldingPatterns: true` to `DEFAULT_FILTERS` for deterministic default behavior.
- **Situational Globe Motion Tuning**: Default globe auto-rotation now uses the preferred slower baseline speed.

### Upgrade Instructions

To upgrade your local or remote instance to `v0.53.0`:

```bash
# 1. Pull the latest code
git pull origin main

# 2. Rebuild and restart the tactical stack
docker compose up -d --build

# 3. (Optional) Force clear frontend assets if UI anomalies persist
cd frontend && pnpm run build
```
