# iOS safe areas, map sizing and rendering regressions

## Issue

The responsive shell had no iOS safe-area handling. Tactical, Orbital and Intel
canvases retained physical `100vw`/`100vh` sizing inside a dynamic-height shell.
Radio used a fixed header offset, floating HUD cards assumed desktop sidebars,
and Dashboard omitted already-loaded weather alerts. Intel camera animation was
limited to 30 Hz alongside data updates. Busy Tactical pacing used integer wall
clock intervals and counted hidden constellation records.

## Solution

All views now share one safe content box. Map container observers handle layout
changes, camera cadence is separated from data updates, and macro country
overlays use a smaller validated asset with invisible country fills omitted.

## Changes

- index.html/index.css/MainHud: `viewport-fit=cover` and all four safe-area insets,
  one bounded dynamic viewport, container-sized maps, responsive floating HUD
  offsets, and scroll access to Dashboard cards in short landscape windows.
- App/Radio: use the shared header offset. Dashboard receives NWS alerts.
- MapLibreAdapter/MapboxAdapter/MiniMap/useMapContainerResize: observe actual
  container size, resize the engine after layout changes, skip identical sizes,
  disconnect observers and cancel pending work when replaced/unmounted.
  Preserve native resize handling and reconnect the observer after StrictMode
  effect replay; a live orientation test caught a stale canvas despite a resized
  map element. A new regression test covers that early-load/effect sequence.
- IntelGlobe/SituationGlobe: up to 60 Hz camera motion; layer updates remain
  independent (10 Hz Intel pulse, 30 Hz Situation interpolation). Intel pulse time
  is continuous rather than resetting every second.
- useAnimationLoop: use monotonic frame timestamps with a timing tolerance;
  satellite pacing uses the previous visible count rather than the whole catalog.
- SystemSettingsWidget/AlertsWidget/UserMenuWidget: portal menus into the safe
  viewport, keeping settings out of the toolbar scroll clipping context.
- Dashboard: right column scrolls at short desktop heights; empty pass results,
  missing mission and prediction failures have distinct messages with retry.
- Country overview: source 14,643,643 bytes; overview 3,341,832 bytes. All 258 records,
  original properties and 4,274 polygon parts retained. Geometry is generalized,
  while the detailed original asset remains unchanged. Validation found China,
  Greenland and Japan needed topology-preserving fallback simplification.
- buildCountryHeatLayer: only upload countries with non-stable actor fills.
- Regression tests for resize/replacement/cleanup and invisible country omission.
- Browser smoke now supports WebKit, persistent simulated insets and populated
  Dashboard fixtures, with assertions against actual safe viewport and map bounds.

## Verification

- Host frontend dependencies unavailable; mounted current source into the existing
  Node 22/pnpm check image. Frontend lint and typecheck passed; all 300 tests passed.
  Follow-up targeted lint, typecheck and tests covered the resize-loop guard.
- Overview generator and Shapely validation passed; feature properties/types,
  part counts, nonempty geometries and outer-ring closure checked. No newly invalid
  geometries remain relative to the source.
- Read-only database check: 22,914 GDELT events, 12,117 satellites, 104 outage records.
  Recent backend logs showed successful Dashboard news/GDELT/pass requests.

- Production image build passed. Recreated the frontend, tested nginx config and
  gracefully reloaded ingress. Entry HTML and linked assets returned HTTP 200;
  deployed HTML includes `viewport-fit=cover`, CSS includes safe-area rules, and
  the served overview asset hash matches the source. `/health` reports `ok` and
  all 14 Compose services are running, with configured health checks healthy.
- Playwright WebKit populated smoke passed all five views in portrait 390 × 844
  with 59 px top/34 px bottom insets and landscape 844 × 390 with 59 px side/21 px
  bottom insets. Safe boxes measured 390 × 751 and 726 × 369 respectively. Maps
  remained horizontally inside the safe box; full-screen maps matched its height.
  Dashboard's scrollable maps intentionally extend vertically into its scroll area.
- Populated news/pass fixtures and NWS count 1 appeared in Dashboard. Drawer and
  portaled settings dialog open/close and bounds checks passed. Both warm WebKit
  runs decoded all 150 synthetic tracks. Screenshots/raw JSON are in
  `frontend-ios-2026-10-06/`.
- WebKit still reports nonfatal ResizeObserver notifications during map mounting,
  despite avoiding duplicate resize work in the new observer. The safe-area/content assertions pass.
  Physical Safari verification is still needed; these logs are preserved. Remote
  fonts are deliberately blocked, and pending requests are cancelled on view change.
- Live WebKit orientation check passed: Tactical drawing canvas and map element
  changed from 390 × 751 to 726 × 369 after a portrait-to-landscape resize and
  side-inset change. `webkit-rotation.json` and `tactical-rotated.png` record this.
- Python overview validation helper passed Ruff; browser profiler syntax passed
  Node checks. `git diff --check` passed. No backend code or persistent data changed.


## Benefits

Interactive content stays clear of iOS notches and the home indicator. Map canvases
match their containers after orientation and card-layout changes. Intel camera
motion avoids the forced 30 Hz stepping, country overlay download/geometry costs
fall, and Dashboard weather data and clipped content become accessible.

Temporary preview container and dependency volume were removed after verification.

Physical iOS Safari and desktop hardware frame rates still require device testing.
Playwright WebKit with injected insets validates browser layout, not physical
Safari chrome or GPU throughput.

## References

- [WebKit safe-area design guidance](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
- [Mapshaper simplification reference](https://mapshaper.org/docs/reference.html#-simplify)
