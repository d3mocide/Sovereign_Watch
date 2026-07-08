# GDELT Cold-Start Recovery + Terminator Globe Occlusion + Kinetic Ranker NaN Fix

## Issue

After a full container rebuild the Intel Map and Dashboard showed no Active Actors
or Conflict Zones for ~15 minutes, and two related display defects surfaced:

1. **Slow cold-start population.** The GDELT poller is healthy (it published
   1068 GDELT + 142 ReliefWeb events on schedule), but the dashboard stayed
   empty far longer than the data pipeline required. Two amplifiers on top of
   the unavoidable "wait for the next 15-min GDELT drop":
   - `/api/gdelt/events` and `/api/gdelt/actors` cache their response in Redis
     for 5 minutes **including empty results**. A request that arrived after the
     backend came up but before the historian inserted the first batch pinned an
     empty `FeatureCollection` / empty actor list for a full TTL, even though
     rows landed seconds later.
   - The dashboard/globe GDELT consumers refreshed on a **15-minute** timer, so
     a client that loaded into the empty window waited up to 15 min for its next
     fetch.

2. **Terminator (night-shading) broken on the globe.** `getTerminatorLayer`
   always used `depthTest: false`, unlike every other globe-surface polygon
   layer (`buildAuroraLayer`, `buildCountryHeatLayer`) which use
   `depthTest: !!globeMode` + a small `depthBias`. With depth testing off, the
   far-hemisphere half of the night polygon rendered *through* the planet and
   tinted the wrong side of the visible globe.

3. **Kinetic ranker showed `NaN%`.** `GdeltBreakdownWidget` computes each ratio
   bar as `breakdown.conflict / breakdown.total`. When the feed is still empty
   (`total === 0`) but `breakdown` is non-null, this is `0 / 0 = NaN`, rendering
   "NaN%" for every band while the pipeline was still cold.

A stray malformed comment (`/ depthTest...` — a single leading slash) was also
present above the SituationGlobe terminator call site.

## Solution

- **Backend:** skip the Redis cache write when the GDELT events/actors result is
  empty, so the next request re-queries the DB and recovers the moment rows land.
- **Frontend refresh cadence:** drop the GDELT refresh interval from 15 min to
  5 min in all three consumers (`useInfraData`, `SituationGlobe`, `NewsWidget`)
  so it matches the 5-min server cache TTL — a cold client recovers within one
  cache window instead of a full 15-min poll gap.
- **Terminator:** add a `globeMode` parameter. In globe mode use
  `depthTest: true` + `depthBias: -5.0` (mirroring the aurora oval) so the
  globe depth mask occludes the far-side night hemisphere; flat map keeps
  `depthTest: false`. Layer id is now mode-suffixed and `wrapLongitude` is set
  for the flat map. Fixed the malformed comment.
- **Kinetic ranker:** added a `pct()` helper that returns 0 when `total === 0`,
  replacing all eight `count / total * 100` expressions, so empty feeds render
  0% bars instead of NaN%.

## Changes

### `backend/api/routers/gdelt.py`
- `get_gdelt_events`: guard cache write with `if features and ...`.
- `get_gdelt_actors`: guard cache write with `if result and ...`.

### `backend/api/tests/test_gdelt_router.py`
- Added `_mock_redis()` helper and 4 tests: empty events/actors results are not
  cached; non-empty results are cached (`setex` awaited once).

### `frontend/src/components/map/TerminatorLayer.tsx`
- `getTerminatorLayer(visible, globeMode = false)`: mode-suffixed id,
  `wrapLongitude: !globeMode`, globe-mode depth test + bias.

### `frontend/src/layers/composition.ts`
- Pass `globeMode` to `getTerminatorLayer` and include it in the cache key.

### `frontend/src/components/map/SituationGlobe.tsx`
- Call `getTerminatorLayer(!!showTerminator, true)`; GDELT refresh 15m → 5m;
  fixed malformed comment.

### `frontend/src/hooks/useInfraData.ts`
- GDELT refresh interval 15m → 5m.

### `frontend/src/components/widgets/GdeltBreakdownWidget.tsx`
- Added `pct()` guard; replaced all divide-by-total ratio expressions.

### `frontend/src/components/widgets/NewsWidget.tsx`
- Live-threats (GDELT) refresh interval 15m → 5m.

## Verification

```
cd frontend && pnpm run lint         # clean
              pnpm run typecheck     # clean
              pnpm run test          # 289 passed
cd backend/api && uv tool run ruff check routers/gdelt.py tests/test_gdelt_router.py  # clean
                  uv run python -m pytest tests/test_gdelt_router.py  # 15 passed (4 new)
```

Note: the poller → `gdelt_raw` → historian → `gdelt_events` write path was
audited and is unchanged; the recent merged PRs (#331 date parser, #332
WebSocket/frontend/JS8Call) do not touch it. The ~15-min delay was the normal
cold-start cadence amplified by empty-result caching, not a pipeline break.

## Benefits

- A cold-started backend recovers the dashboard/map within seconds of the first
  GDELT batch instead of staying empty for up to a full cache TTL + poll gap.
- The globe night-shading no longer bleeds through the planet to the near side.
- The kinetic ranker shows 0% bars on an empty feed instead of NaN%.
