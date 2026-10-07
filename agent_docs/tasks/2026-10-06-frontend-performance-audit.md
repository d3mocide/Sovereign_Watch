# Frontend performance audit

## Issue

Audit the dashboard, Tactical map, Orbital map, and Intel globe for opportunities
to improve responsiveness, rendering cost, startup, and resource usage. This is
an audit; application behavior and running services are unchanged by this task.
Earlier uncommitted stack improvements remain intact.

## Solution

Trace each view's rendering/data pipeline, identify repeated work, measure actual
CPU geometry builders against representative synthetic workloads, and rank
changes by evidence and implementation risk. Preserve the Mapbox/MapLibre and
deck.gl architecture, picking, map projections, layer depth ordering, and live
TAK protocol. Reuse the earlier browser results only with their documented
software-GPU limitations; do not infer hardware FPS from them.

## Findings and proposed changes

### 1. Intel globe: stop rebuilding unchanged arc geometry (highest priority)

`components/map/IntelGlobe.tsx:186` calls `buildGdeltArcLayer` on every rAF tick.
`layers/buildGdeltArcLayer.ts:195` caches normalized arc records, but the globe
branch still regenerates great-circle paths, deterministic jitter, and gradient
segments on every call. Pulse changes color/alpha; the spatial paths stay the
same for the same records. Four layered PathLayers share the newly allocated
segment data and incur further attribute/update/draw work.

Measured geometry construction with mocked deck constructors:

| Synthetic workload | Output size | Median CPU time | p95 CPU time |
| --- | --- | --- | --- |
| 100 globe arcs | 6,633 path segments | 8.35 ms | 12.07 ms |
| 1,000 globe arcs | 66,330 path segments | 76.86 ms | 122.50 ms |

A 30 FPS frame budget is about 33.3 ms; 60 FPS is about 16.7 ms. The 1,000-arc
builder exceeds either budget before GPU uploads/drawing. These workloads are
controlled synthetic cases, not claims about the current event count.

Cache spatial path/segment/endpoint data by source data, projection, and centroid
readiness/version. Keep stable `data` references across pulse ticks. Animate
opacity through a uniform or color-only updates (initially paced to 10 Hz) so
path coordinates and widths do not rebuild. Bound concurrent decorative arcs
with a documented detail tier if still needed. Preserve source/target meaning,
fan separation, antimeridian behavior, and globe altitude.

The Intel loop also rebuilds static H3/country layer objects every display tick.
Reuse the existing per-overlay `LayerCache`; do not share stateful Layer
instances across overlays. Creating Layer instances alone does not prove GPU
buffers rebuild: changed data references are the more significant issue here.

### 2. All globe satellites: shared instanced geometry instead of fresh polygons

`layers/OrbitalLayer.tsx:108` creates eight triangle objects per satellite for
its globe gem marker, including position arrays, every rendered frame. This
builder is shared by Tactical globe, Orbital, and the dashboard Situation globe.

| Synthetic workload | Triangle objects per call | Median CPU time | p95 CPU time |
| --- | --- | --- | --- |
| 1,000 satellites | 8,000 | 1.81 ms | 7.17 ms |
| 12,728 satellites | 101,824 | 43.23 ms | 68.52 ms |

At the existing 30 Hz busy cadence, the full case implies about three million
triangle datum objects created per second, plus arrays, before deck's own work.
Not every view displays every satellite; the dashboard already filters for
intelligence categories. The full-catalog case is relevant when those records
are visible in Orbital or globe views.

Use one shared octahedron mesh with per-satellite instance positions, scale,
category color, and selection state. Preserve gem appearance at close range;
consider a cheaper marker detail tier at distant zooms. Keep picking linked to
satellite UIDs. Benchmark instance-position updates and visual equivalence in
both adapters. Viewport/altitude-aware culling is a later option; above-limb
satellites must remain visible, and culling must not change global counts or
silently remove tracked/selected targets.

### 3. Dashboard: keep animation outside React and share already-loaded feeds

`components/map/SituationGlobe.tsx:148` calls `setNow` every rAF tick, then builds
layers in an effect keyed by that state. This causes React work at animation
cadence despite the comment describing an imperative path. Its `onMove` handler
also calls `setViewState` for programmatic rotation. Move the animation clock
and camera rotation to refs/direct overlay updates; reserve React updates for
interaction, selections, and throttled UI summaries.

`IntelGlobe` rotates imperatively, but its unconditional `onMove` state setter
provides another React-update path for programmatic camera movement. Measure
React commits during spin, then separate user camera updates from automatic
rotation. The mount-only loop captures initial `viewState.latitude`; use a live
camera ref so resumed rotation does not restore the initial latitude after a pan.

Dashboard already receives parent GDELT data, while SituationGlobe independently
polls `/api/gdelt/events` every five minutes. Share that data through a common
snapshot/cache, retaining the appropriate category/tone filters. MiniMap's
five-second update sends every GeoJSON source through `setData`, including
unchanged hazards; update dynamic tracks independently of slower hazard/source
revisions. Memoize widget boundaries once animation/state ownership is corrected;
blanket `memo` will not help changing props/internal state.

### 4. All maps: lighter country polygons and deliberate rendering budgets

`App.tsx:337` fetches `/world-countries.json` on authenticated application mount.
The checked-in asset contains 258 features and 548,472 coordinate tuples:
14,643,643 bytes of JSON; 4,582,395 bytes under default Python gzip. Production
nginx already enables JSON gzip, so enabling compression again is not the fix.
Browser parse, allocations, triangulation, and uploads still process the full
geometry. Python parsing measured 422 ms; this is not a browser parse estimate.

Generate a topology-preserving simplified globe/overview asset offline, retain
sufficient detail for close views, preserve country identity/hit testing, and
load boundary data when the relevant overlay is needed. Validate shared borders,
small islands, holes, and antimeridian crossings. Cache one parsed snapshot for
all views. Record payload size, coordinate count, startup trace, and visual
regressions before choosing a simplification tolerance.

Both map adapters enable antialiasing; no explicit overlay pixel-ratio cap was
found. An optional quality setting can cap rendering resolution on high-DPI
screens and reduce decorative effects, while maintaining a clear default.
Measure each engine on intended hardware before choosing defaults. Keep globe
occlusion/depth fixes intact.

### 5. Tactical/common loop: avoid hidden work and noisy UI updates

`hooks/useAnimationLoop.ts:556` sets the busy cadence from all received aircraft
and satellites, including hidden categories. `EntityPositionInterpolator.ts:10`
still walks every satellite when `showSatellites` is false. Short-circuit hidden
satellite passes and base pacing on visible work plus measured frame cost.
Preserve epoch anchoring and resume behavior.

Selected satellite details receive live updates every rendered frame; aircraft
updates use a wall-clock modulo gate rather than a true elapsed-time throttle.
Throttle sidebar text/details independently (for example 5–10 Hz after UX
validation), keeping map motion smooth and alerts immediate. Stop optional
rotation/pulses offscreen; pause polling while hidden where safe and refresh on
resume. Browsers already throttle background rAF, so do not promise that an
additional hidden-tab guard removes all background work.

The count-update guard at `useAnimationLoop.ts:750` prevents a nonzero count from
transitioning to all zero. Fix this correctness issue with an explicit regression
test; a clear map must not leave stale tracking totals in the UI.

The optional Stats dashboard polls throughput/sensors both in its 30-second
batch and five-second batch, and polls operations regardless of active tab.
Separate active-tab demand, avoid overlapping requests, and share snapshots.
These are secondary to the measured geometry costs.

### Related correctness risk to cover during optimization

`buildCountryHeatLayer` uses unchanged country GeoJSON with actor-dependent color
accessors but supplies no actor `updateTriggers`. The deck.gl contract requires
explicit accessor invalidation when their external dependencies change while
data stays stable. Verify that new actor threat levels refresh colors, and add
color/line-width triggers when caching the layer. This is a source/API-contract
risk, not a completed browser rendering regression test.

Arc records cached before centroid fetch completion may retain fallback routing
until the next GDELT data object. Include centroid readiness in cache invalidation.

## Recommended implementation order

1. Cache Intel arc geometry; pace color/pulse work; cache static Intel groups;
   fix country color invalidation and zero-count transitions.
2. Move dashboard animation out of React; fix programmatic camera state paths;
   throttle sidebar updates and skip hidden satellite passes.
3. Replace globe satellite polygon expansion with shared instanced geometry,
   preserving appearance, picking, and selection. This is the larger rendering
   change and deserves dedicated projection/visual validation.
4. Add simplified boundary detail tiers and optional pixel-ratio/animation quality
   settings; deduplicate dashboard feeds and slow source updates.
5. Compare production browser traces for Dashboard, Tactical 2D/3D/globe,
   Orbital, and Intel on intended hardware: cold/warm startup, steady updates,
   pan/zoom, selection/follow, hover, filters, hide/resume, and repeated switching.

## Changes

Added this audit, `frontend-audit-2026-10-06/cpu-geometry.json`, and the reproducible
`tools/performance/geometry-audit.cjs` benchmark. No application source/config,
backend service, data volume, or running container was changed for this audit.

## Verification

- Read all four view pipelines, shared builders/interpolators, dashboard polling,
  adapter configuration, and layer ordering rules.
- Executed the existing TypeScript geometry functions after transpilation with
  mocked deck constructors/canvas and local centroid data. Three warm-up calls,
  fifteen timed calls per workload; median and p95 recorded. This isolates CPU
  construction, not end-to-end rendering, React, shaders, uploads, or memory use.
- Checked country asset byte size, compressed size, feature and coordinate counts.
- Confirmed documented deck.gl update/data invalidation behavior with official
  sources below. Benchmark JavaScript syntax and Git whitespace checked.
- Application lint/typecheck/test suites skipped: no application files modified.
  Prior test results are not represented as new audit validation.
- Real-GPU frame rates, before/after gains, visual equivalence, and picking behavior
  remain unmeasured because these are proposed changes, not implemented fixes.

## Benefits

The audit identifies measured frame-budget overruns and a staged improvement plan
that preserves map detail and architecture. It also distinguishes actual CPU
work from software-GPU artifacts and protects correctness while reducing churn.

## References

- [deck.gl performance guide](https://deck.gl/docs/developer-guide/performance)
- [deck.gl layer data and updateTriggers contract](https://deck.gl/docs/api-reference/core/layer)
