# Responsive frontend and rendering improvements

## Issue

The desktop shell consumed most of a tablet or phone viewport, hid view navigation
below the desktop breakpoint, and kept Dashboard in fixed columns. Globe arc
geometry and satellite polygon objects were reconstructed during animation.

## Solution

Preserve the MapLibre/Mapbox and deck.gl architecture while moving panels into
mobile drawers, exposing view navigation, and reducing repeated geometry work.

## Changes

- MainHud and TopBar: responsive view navigation, mutually exclusive drawers,
  explicit touch close buttons, backdrop/Escape dismissal, dynamic viewport height.
  Map toolbar remains horizontally scrollable so toggles stay accessible.
- DashboardView/index.css: stacked, scrollable cards below the desktop breakpoint;
  phone map cards and bottom widgets stack vertically. MapControls uses larger
  touch targets and wraps within the phone viewport.
- buildGdeltArcLayer: cache globe segments/endpoints by source data and centroid
  readiness. Pulse changes layer opacity without rebuilding geometry.
- OrbitalLayer/satelliteMesh: share one eight-triangle mesh across satellite
  instances, with per-instance scale/color/position and direct entity picking.
  Explicit `depthCompare: less-equal` uses the typed deck.gl v9 depth parameter.
- IntelGlobe/SituationGlobe/MapLibreAdapter: update automatic camera movement
  imperatively, preserve the latest user latitude, cap overview updates around
  30 Hz, and pause animation work in hidden tabs. Camera commands explicitly set
  longitude/latitude through `center`; controlled tactical camera mode remains.
- SituationGlobe reuses Dashboard GDELT data, retaining its actor polling.
- useAnimationLoop/EntityPositionInterpolator: hidden satellite layers avoid
  scans, hidden satellites do not inflate the frame budget, sidebar updates have
  a 150 ms cadence, and counts can return to zero.
- buildCountryHeatLayer: actor color/width update triggers invalidate attributes.
- useRenderPixelRatio and both adapters: cap deck overlay pixel ratio at 1 on
  small/touch viewports and 2 on desktop. Basemap renderer resolution is unchanged.
- Regression tests cover geometry sharing, centroid arrival, polar marker scales,
  hidden satellite processing, drawer switching and dismissal.
- Performance tools support the new mesh benchmark and mobile viewport smoke.

## Verification

- Host frontend dependencies are unavailable; used the existing Node 22/pnpm
  frontend check image with current source mounted read-only.
- Full frontend lint, typecheck and unit suite passed: 27 files, 297 tests.
  The final drawer close-button edit also passed targeted lint and drawer tests.
- Phone 390 × 844 and tablet 820 × 1180: visited all five views, opened/closed the layers drawer,
  decoded 150/150 synthetic TAK tracks, and measured body width equal to viewport width in every view.
  Screenshots and raw output are in `frontend-responsive-2026-10-06/`.
  Expected errors come from deliberately blocked remote font requests; no
  application or deck.gl errors occurred in that run.
- Mobile smoke uses blank tiles and no country polygons under SwiftShader;
  it verifies navigation/layout and synthetic track rendering, not full-load FPS.

CPU-only benchmark with mocked deck constructors: 12,728 satellite instance scales
1.176 ms median; cached 1,000-arc updates 0.003 ms median. The previous audit measured
43.232 ms building satellite faces and 76.861 ms rebuilding those arc segments.
These are different workloads demonstrating avoided work, not end-to-end FPS.

- Production Compose image build passed. Recreated only the frontend and
  gracefully reloaded nginx to refresh its upstream address. The proxy returned
  HTTP 200 for the entry page and every linked asset; the deployed App includes
  the new drawer close buttons. `/health` returned `{"status":"ok"}`. All 14
  Compose services remained running, with configured health checks healthy.
- `git diff --check` passed. Temporary preview container/dependency volume removed.

## Benefits

More room for maps on smaller screens, accessible navigation and panels, less
allocation and React work during animation, and a bounded overlay resolution.
Physical phone/tablet GPU performance and full-country geographic load require
hardware measurements; software WebGL layout checks cannot establish those.
