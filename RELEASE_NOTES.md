# Release - v0.54.0 - Hazard Signal Hardening and Tactical Overview Parity

This release improves operator trust in hazard intelligence by tightening holding-pattern detection quality gates, reducing alert channel noise, and extending hazard visibility into the Tactical Overview mini-map. The result is clearer hazard severity communication and better signal-to-noise during high-traffic monitoring.

### Key Features

- **Stricter Holding Pattern Detection**: Holding logic now enforces full-turn accumulation, minimum duration, and directional consistency checks before flagging a hold.
- **Severity-Aware Hazard UX**: Holding severity is now visually aligned across map layer rendering, sidebar detail cards, and hover tooltips.
- **Tactical Overview Hazard Overlays**: Mini-map now includes live GPS integrity and holding-pattern overlays with a compact hazard legend and critical-hold indicator.
- **Alert Channel Noise Reduction**: Non-critical holding detections now route to Intel Feed while critical holds remain in Alerts.

### Technical Details

- **Holding Detector Hardening** (`backend/ingestion/aviation_poller/holding_pattern.py`):
	- Added bounded env parsing and stricter default thresholds.
	- Added directional consistency scoring and minimum duration gating.
	- Corrected rolling window turn recomputation to prevent stale-turn inflation.
- **Frontend Severity Rendering**:
	- `buildHoldingPatternLayer` now uses an amber/orange/red severity ramp.
	- 5+ completed turns render as critical red severity.
	- Sidebar and tooltip now expose severity labels for faster triage.
- **Mini Tactical Hazard Overlay Pipeline** (`frontend/src/components/widgets/MiniMap.tsx`):
	- Polls `/api/jamming/active` and `/api/holding-patterns/active` every 30s.
	- Renders local halo/core circles for hazards.
	- Hazard legend moved to bottom-right for reduced overlap with mission context.
- **Test Reliability Updates**:
	- OpenSky tests updated to use separate bbox/watchlist limiter attributes.
	- Holding detector tests expanded to cover duration and directional consistency gates.
- **News Feed Defaults** (`backend/api/routers/news.py`):
	- Updated default sources to BBC World, Reddit News, and Al Jazeera.

### Upgrade Instructions

To upgrade your local or remote instance to `v0.54.0`:

```bash
# 1. Pull the latest code
git pull origin main

# 2. Rebuild and restart all services
docker compose up -d --build

# 3. Optional frontend cache reset if stale UI assets appear
docker compose build frontend
```
