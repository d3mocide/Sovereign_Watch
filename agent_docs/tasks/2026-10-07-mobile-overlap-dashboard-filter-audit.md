# Mobile overlap, dashboard and filter audit

## Issue

Intel's map controls retained the desktop bottom offset and overlapped the mobile contextual dock and main view navigation. Feeds/Layers used dense desktop chips and abbreviated track types. Dashboard retained large forced empty sections and long Summary lists.

## Solution

Reserve shared space above mobile navigation for map controls, place Intel news in the overview's normal flow, and hide canvas controls while drawers are open. Introduce dedicated mobile track-type controls and improve existing map-layer chip spacing. Refine dashboard flow and bound long lists without dropping their entries.

## Changes

- `frontend/src/App.tsx`: mobile Intel news lives inside the overview; desktop ticker mounts only on desktop, avoiding duplicate mobile polling.
- `frontend/src/components/widgets/MobileTrackFilters.tsx`: expandable Aircraft/Maritime/Orbital groups, explicit domain On/Off buttons, readable subtype names, visible native checkboxes, selection counts, and a disabled-domain explanation. A domain toggle does not overwrite subtype preferences.
- `frontend/src/components/widgets/LayerFilters.tsx`: uses the dedicated mobile view below 1280 pixels; desktop filters remain.
- `frontend/src/components/widgets/LayerFilters.test.tsx`: verifies independent mobile domain/subtype choices and group switching, plus existing desktop checkbox association regression.
- `frontend/src/components/widgets/IntelFeed.tsx`: labeled mobile Air/Sea/Orbit controls and a filter container that uses drawer scrolling.
- `frontend/src/components/widgets/LayerVisibilityControls.tsx`, `SystemStatus.tsx`: scoped styling hooks for infrastructure groups and track statistics.
- `frontend/src/index.css`: shared mobile map-control position, drawer occlusion, green active map controls, inline Intel news, landscape overview suppression when 3D camera controls need the space, less crowded Intel headers, 48-pixel subtype rows, one column on narrow phones, larger infrastructure chips, header-only Map Layers click area, sticky-tab scroll padding, responsive tracking statistics, inline dashboard section controls, a responsive mission preview, bounded Summary list scrolling, and removal of forced Intel/feed whitespace.
- `tools/performance/mobile-workspaces.cjs`: checks actual map-control intersections with overview/context/main navigation; expands every mobile track group in Feeds and Layers; validates label bounds and touch-target height; expands infrastructure groups and checks their controls.

## Verification

- Standard frontend lint/typecheck/tests passed using the existing check image (host dependencies unavailable): 309 tests in 32 files. Checks repeated after final TypeScript changes.
- Chromium expanded workspace checks passed at 390×844, 320×740 and 844×390, including all track groups in both surfaces and expanded infrastructure controls. Verified overview/navigation intersections and control bounds.
- WebKit expanded phone checks passed at 390×844.
- Chromium also passed all five workspaces at 1024×768 and 1440×900, including desktop sidebars and absence of mobile section controls.
- Final production image built successfully; recreated frontend and tested/reloaded nginx. Entry assets, lazy App bundle and `/health` returned HTTP 200.
- Production Chromium passed all five workspaces at 390×844 and 844×390, including 3D control intersections, drawer occlusion and expanded filters. All 14 Compose services remained running.
- Review screenshots: [Intel](frontend-layout-audit-2026-10-07/production/intel-map.png), [Feeds filters](frontend-layout-audit-2026-10-07/production/tactical-feeds-aircraft.png), [Dashboard](frontend-layout-audit-2026-10-07/production/dashboard-summary.png). Browser fixtures isolate API data and blank remote map styles. These checks verify layout and interaction, not physical-device frame rates. No map-layer depth behavior changed.

## Benefits

Intel controls no longer compete with navigation. Mobile filters expose their meaning and selection state clearly without squeezing desktop chips into narrow rows. Dashboard puts more useful content in view and keeps longer feeds accessible through bounded scrolling.
