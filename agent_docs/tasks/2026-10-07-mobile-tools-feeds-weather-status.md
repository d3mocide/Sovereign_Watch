# Mobile Tools, Feeds layer access, Status and map weather

## Issue

Mobile Feeds exposed only track-type filtering. Tools did not provide a usable expanding map-layer surface; its broad mobile CSS hid nested labels/content. Status only displayed contextual widgets, so it could look like a single card. NWS alerts were inside Status rather than available on the tactical map.

## Solution

Expose the full layer groups from Tools and Feeds, scope toolbar styling to top-level actions, provide useful Status summary cards, and attach compact expandable NWS alerts to the map overview.

## Changes

- `frontend/src/components/layouts/TopBar.tsx`: native expandable mobile Map layers section with infrastructure/environmental/analysis/hazard and track-type controls.
- `frontend/src/components/widgets/IntelFeed.tsx`: mobile Feeds filter options include map-layer selections as well as track-type groups.
- `frontend/src/components/widgets/LayerVisibilityControls.tsx`: instance-specific IDs prevent labels from toggling a hidden checkbox in another menu.
- `frontend/src/components/widgets/MobileStatusCards.tsx`: real mission, heartbeat connection, track counts and ingestion stream summaries.
- `frontend/src/components/widgets/StreamStatusMonitor.tsx`: optional explicit empty label for unavailable stream status; desktop default preserved.
- `frontend/src/components/widgets/NWSAlertsWidget.tsx`: compact map presentation, pending/no-mission/empty states, severity labels and instance-specific disclosure IDs.
- `frontend/src/App.tsx`: compact NWS appears on Tactical's overview; desktop NWS stays in its HUD stack; mobile Status includes summary cards and existing contextual analysis/space-weather widgets.
- `frontend/src/components/layouts/MainHud.tsx`: overview widgets remain mounted while drawers hide them, preserving weather disclosure and notification deduplication state.
- `frontend/src/index.css`: scope toolbar rules to top-level buttons/text, scroll expanded layer groups in their containing menu, support responsive compact weather and multi-card status layout, and keep landscape controls from overlapping expanded weather.
- Tests cover independent menu checkbox routing, pending/no-mission NWS state, mission alert disclosure and notification deduplication, and retained overview state across drawer navigation.
- `tools/performance/mobile-workspaces.cjs`: active mission weather fixture; expands weather, checks four Status cards, expands Tools/Feeds map-layer controls and toggles a track checkbox.

## Verification

- Frontend lint and typecheck passed; 313 tests across 34 files passed using the host-mounted source in the existing frontend check image (host dependency toolchain unavailable).
- Chromium workspace interaction/layout checks passed at 390×844, 320×740, 844×390, 1024×768 and 1440×900.
- Docker Compose production frontend build passed; frontend recreated and ingress nginx configuration tested/reloaded.
- Production Chromium checks passed across all five workspaces at 390×844 and 844×390. Expanded Tools/Feeds groups, checkbox updates, four Status cards and mission weather disclosure were exercised.
- Ingress health and entry bundle assets returned HTTP 200; all 14 Compose services running.
- Browser tests use isolated API fixtures and blank remote map styles; they test layout and interactions, not physical-device performance.
- Production WebKit checks passed across all five workspaces at 390×844 with simulated iPhone safe areas. An earlier development-preview run went blank during Orbital navigation; this did not reproduce against the production build.
- `git diff --check` passed.

## Benefits

All main mobile entry points expose usable map layers. Status has meaningful summaries rather than a sparse contextual card. Weather alerts are visible on the map and retain their state across drawer navigation.
