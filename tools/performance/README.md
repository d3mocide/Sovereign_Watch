# Isolated browser performance profile

`browser-profile.cjs` measures canvas startup, animation-frame intervals, long
main-thread tasks, decoded record count, and JS heap. It mocks authentication,
API responses, remote basemaps, and a TAK stream with 2,000 aircraft and 12,000
satellites. It measures Tactical by default; `PROFILE_ORBITAL=1` also measures
Orbital. The Orbital globe uses MapLibre even when Tactical uses Mapbox. No real login or live data is needed.

Install the frontend's locked dependencies and Playwright Chromium, then run:

```sh
PROFILE_OUTPUT=/tmp/sw-profile node tools/performance/browser-profile.cjs
```

By default it starts Vite sequentially for both engines on port 3900 with a
synthetic public Mapbox token. `ENGINE=mapbox` or `ENGINE=maplibre` selects one.
`EXTERNAL_SERVER=1` uses an existing Vite server on port 3900; start that server
with the corresponding `VITE_ENABLE_MAPBOX` flag and `VITE_MAPBOX_TOKEN=pk.profile`.
`FRONTEND_DIR` overrides the frontend location (for example `/app` in Docker).
Writable frontend dependencies are needed when Vite prepares its cache.
`AIRCRAFT_COUNT` and `SATELLITE_COUNT` control the workload. For this software
GPU VM, start with 200 aircraft and 1,000 satellites; full-catalog globe
profiling should also be performed on the intended rendering hardware. The
logical viewport is 1280×720 with device scale 0.5 to limit software raster cost.
Native dependencies must match the server's OS/libc; an Alpine Vite server and
Ubuntu Playwright browser can run separately through host networking.

Allow Vite to finish dependency optimization before recording final results;
its initial reloads distort startup and duplicate synthetic delivery. Headless
SwiftShader is software rendering, so these results are diagnostics, not the
physical GPU frame rate. Remote fonts/telemetry are intentionally blocked.
Compare using the same browser, viewport, dataset, view, and rendering hardware.

## CPU geometry audit

`geometry-audit.cjs` runs the actual TypeScript satellite-marker and globe-arc
builders with mocked deck constructors. It excludes browser/GPU costs and is
useful for identifying CPU construction work that exceeds a frame budget:

```sh
node tools/performance/geometry-audit.cjs
```

The frontend must have its locked dependencies installed. `FRONTEND_DIR` chooses
the source/assets directory; `DEPENDENCY_ROOT` chooses the installed dependency
root when different. For the existing development-check Docker image:

```sh
docker run --rm \
  -e FRONTEND_DIR=/workspace -e DEPENDENCY_ROOT=/app \
  -v "$PWD/frontend:/workspace:ro" \
  -v "$PWD/tools/performance/geometry-audit.cjs:/audit.cjs:ro" \
  sovereign-frontend-check node /audit.cjs
```

Results use three warm-up calls and fifteen timed calls per synthetic workload.
Run comparisons in the same environment; CPU timings are not an FPS prediction.

Touch layout smoke checks can use the same isolated profiler with
`MOBILE_SMOKE=1 VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=844` (or 820 × 1180).
The check opens and closes the layers drawer, visits all five views, and writes
screenshots plus viewport/body widths. It replaces country polygons with an
empty collection to keep software WebGL usable; this checks layout and synthetic
track rendering, **not** full geographic load or real device frame rates.

Safe-area checks use `SAFE_INSETS=59,0,34,0` (top/right/bottom/left pixels)
for a portrait notch/home indicator and `SAFE_INSETS=0,59,21,59` in landscape.
`BROWSER=webkit` selects Playwright WebKit. These inject nonzero CSS inset
variables, not physical iPhone Safari chrome. The checks assert the safe box
and map element bounds; scrollable Dashboard maps may extend vertically while
remaining bounded horizontally. `POPULATED_SMOKE=1` mocks a mission, news,
passes, actors, GDELT and weather alerts, and checks Dashboard content. It loads
the real overview country asset rather than the empty collection used by the
original layout smoke. Vite optimization reloads invalidate synthetic stream
measurements; warm the server before recording them.

The country overview asset is generated outside the frontend dependency graph:

```sh
npm install --prefix /tmp/sw-country-tools --no-audit --no-fund mapshaper@0.7.79
MAPSHAPER_BIN=/tmp/sw-country-tools/node_modules/.bin/mapshaper node tools/performance/build-country-overview.cjs
uv run --no-project --with shapely==2.1.2 python tools/performance/validate-country-overview.py
```

Both commands are required. The validation pass replaces any newly invalid
country geometry with a topology-preserving simplification of its original
geometry, and checks feature properties and polygon part counts. The detailed
source remains unchanged. Overview geometries are generalized for macro overlays;
basemap tiles supply detailed boundaries at close zoom.
