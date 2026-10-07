# Mobile visual redesign

## Issue

The mobile workspaces were navigable but lost the desktop's visual hierarchy. Small labels, repeated green outlines, and sparse full-height panels made the phone interface feel flat. The dashboard summary lacked a map preview, while Radio's empty message area gave little guidance.

## Solution

Compared desktop and phone screenshots, then introduced a mobile visual system: larger telemetry, distinct domain accents, layered navy cards, icon navigation, clearer panel headings, and useful empty states. Existing safe-area geometry and retained section state remain part of the layout.

## Changes

- `frontend/src/components/layouts/MobileOverviewCard.tsx`: shared view-specific cards showing actual track, event, and alert counts.
- `frontend/src/components/layouts/TopBar.tsx`: compact mobile branding and icon-based view navigation placed at the bottom of the safe viewport.
- `frontend/src/components/layouts/MobileSections.tsx`: section icons while preserving accessible labels and keyboard navigation.
- `frontend/src/components/layouts/MainHud.tsx`: panel headings, close icons, contextual dock icons, and downward heading swipe dismissal.
- `frontend/src/components/layouts/MainHud.test.tsx`: short gesture keeps the panel open; downward swipe dismisses it.
- `frontend/src/App.tsx`: view-specific overview cards and bounded Radio wrapper.
- `frontend/src/components/views/DashboardView.tsx`: telemetry overview and mission map preview in the mobile Summary section. Only one compact dashboard map is mounted at a time.
- `frontend/src/components/js8call/RadioTerminal.tsx`: helpful empty state and setup action; empty messages no longer trigger message auto-scroll.
- `frontend/src/index.css`: mobile typography, neutral borders, colored accents, card depth, footer navigation, landscape sizing, and reduced-motion support.
- `tools/performance/mobile-workspaces.cjs`: full-resolution capture option, screenshot settling delay, and landscape panel dismissal through the header when the contextual dock is hidden.

## Verification

- Host dependencies were unavailable; standard checks used the existing frontend check image with current source mounted.
- `pnpm run lint && pnpm run typecheck && pnpm run test`: passed, 307 tests in 31 files. Repeated after correcting the clipped Radio empty state and empty-log scrolling.
- Chromium workspace checks: all five views passed at 390×844, 320×740, 844×390, 1024×768, and 1440×900. Verified section navigation, horizontal control bounds, compact map mounting, fixture feeds, and desktop sidebars.
- WebKit: all five phone workspaces passed at 390×844, including simulated iOS safe areas.
- `docker compose build sovereign-frontend`: passed. Existing dependency/build advisories remain.
- Recreated the production frontend and tested/reloaded nginx successfully. Entry assets, lazy App bundle, and `/health` returned HTTP 200.
- Production Chromium browser check: all five served phone workspaces passed at 390×844 after deployment.

Screenshots use isolated API fixtures, blank remote map styles, and fallback fonts. They compare layout and visual hierarchy, not live basemap quality or physical-device GPU performance. The screenshot gallery includes desktop references and previous/updated phone layouts: [comparison](frontend-mobile-design-2026-10-07/comparison.html).

## Benefits

Mobile views have clearer information hierarchy, recognizable navigation, and stronger domain identity. Dashboard Summary provides geographic context again; Radio explains how to get started. Touch sheets can be dismissed with a close button or heading swipe, and landscape layouts preserve usable content space.
