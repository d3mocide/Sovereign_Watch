# SovereignGlass mobile theme and tactical color key

## Issue

The mobile redesign replaced the established black/green frosted glass with navy surfaces and domain accents. Tactical altitude and maritime speed legends still used desktop offsets (`left: 410px`), placing them off-screen on phones.

## Solution

Restored the SovereignGlass palette across mobile workspaces and added a compact expandable tactical color key inside the mobile track overview. Desktop retains its vertical legends.

## Changes

- `frontend/src/index.css`: mobile glass surfaces use translucent black, green borders/edge lighting, blur and saturation. Navigation, cards, dashboard and Radio share the desktop palette. Added responsive horizontal key layout, accessible focus ring, and short-landscape sizing.
- `frontend/src/components/map/MobileTacticalKey.tsx`: native accessible disclosure with aircraft altitude (feet) and maritime speed (knots), color previews, explicit ticks, and visibility matching domain filters. Gradients sample the same rendering functions as the map; altitude includes the renderer's gamma curve and labels the approximately 43,000-foot cap. Tick positions correspond to physical altitude/speed.
- `frontend/src/components/layouts/MobileOverviewCard.tsx`: supports supplementary overview content.
- `frontend/src/App.tsx`: adds the key to Tactical's mobile overview using actual Air/Sea filter state.
- `frontend/src/components/map/AltitudeLegend.tsx`, `SpeedLegend.tsx`: existing vertical legends are desktop-only.
- `frontend/src/components/map/MobileTacticalKey.test.tsx`: verifies domain visibility and absence when both layers are disabled.
- `tools/performance/mobile-workspaces.cjs`: opens/closes the key and checks both scale bounds during compact workspace checks.

## Verification

- Standard frontend lint, typecheck and tests passed using the existing check image because host dependencies are unavailable: 308 tests in 32 files.
- Chromium: all five workspaces passed at 390×844, 320×740 and 844×390, including opening/closing the key and horizontal bounds. All five also passed at 1024×768 and 1440×900; desktop sidebars and mobile-only controls were checked.
- Production Chromium: all five served phone workspaces passed at 390×844, including the tactical disclosure. [Expanded tactical key screenshot](frontend-sovereignglass-2026-10-07/production/tactical-color-key.png).
- WebKit: all five phone workspaces passed at 390×844 with simulated iOS safe areas.
- Final `docker compose build sovereign-frontend` passed after correcting key pointer input. Recreated frontend; nginx configuration test and reload succeeded. Served assets, lazy App bundle and `/health` returned HTTP 200. All 14 Compose services remained running.
- Browser checks caught inherited `pointer-events: none` on the overview: enabled input only on the disclosure so map gestures still pass through the noninteractive overview areas.
- Read `agent_docs/z-ordering.md`; no map-layer rendering or depth behavior changed.
- Screenshots use isolated data and blank remote map styles. They verify layout/controls and palette rather than live basemap imagery or physical-device GPU performance.

## Benefits

Mobile again shares Sovereign Watch's visual identity. The tactical key fits the safe viewport, makes air altitude versus vessel speed explicit, follows layer visibility, and can collapse to preserve map space.
