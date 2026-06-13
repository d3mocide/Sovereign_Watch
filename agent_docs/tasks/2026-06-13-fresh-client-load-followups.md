# Fresh-Client Load Follow-ups: Map Asset Preload + News Feed SWR

Follow-up to the WebSocket snapshot work (`2026-06-13-fresh-client-snapshot-replay.md`).
Two further fresh-client slowness sources: the map JS bundle waterfall and the
dashboard's slow text feeds.

## Issue

1. **Map asset waterfall.** The default view is `TACTICAL` → `TacticalMap`,
   which depends on the `deck-gl` (~1 MB) and map-engine (~1 MB MapLibre /
   ~1.7 MB Mapbox) vendor chunks. Since the views are lazy-loaded and the entry
   was deliberately stopped from preloading vendors (`f32c30d`), a cold-cache
   client only discovers these chunks **after** the entry + App chunks download,
   parse, and the dynamic import fires — a multi-hop request waterfall before the
   default view can paint.
2. **Dashboard text feeds slow to load.** `GET /api/news/feed` (NewsWidget)
   fetched the 5 configured RSS feeds **sequentially**, each with a 10 s timeout
   (up to ~50 s worst case), and the Redis cache was populated **lazily** by the
   requesting client. So every 15-minute cache expiry made the next caller block
   on the full upstream fetch. There is no news poller pre-warming the cache.

## Solution

1. **Hoist `modulepreload` hints for the critical map chunks.** A small build-only
   Vite plugin (`mapCriticalPreloadPlugin`) injects
   `<link rel="modulepreload">` into `index.html` for `deck-gl`, the active GL
   engine, and the `TacticalMap` view chunk, so the browser fetches them in
   parallel with the entry instead of serially after it. The engine is chosen at
   build time to mirror `mapStyles.ts`: Mapbox when a valid `VITE_MAPBOX_TOKEN`
   is set (+ `VITE_ENABLE_MAPBOX !== "false"`), MapLibre otherwise. Only the
   default view's engine is preloaded — the globe-only MapLibre in a Mapbox build
   still loads on demand. The cacheable-vendor split is otherwise unchanged.
2. **Concurrent fetch + stale-while-revalidate for the news feed.**
   - `_fetch_feeds` now fetches all sources with `asyncio.gather` (latency bounded
     by the slowest single feed, not the sum) via a non-raising `_fetch_one`.
   - The endpoint serves the cached payload immediately and, once it ages past the
     15-minute freshness window, kicks off a **background** refresh
     (`_trigger_refresh`) so callers never block on the upstream fetch. The data
     is kept for `CACHE_HARD_TTL` (6 h) for stale serving; a `CACHE_FRESH_KEY`
     marks freshness. Background refreshes are deduped within a worker (a held
     task ref) and across workers (a Redis `SET NX` lock). Only a truly cold
     cache (no data at all, or Redis down) fetches synchronously — and that fetch
     is now concurrent.

## Changes

- **`frontend/vite.config.ts`**
  - Switched to the function form of `defineConfig` to read build env via
    `loadEnv` and pick the engine chunk.
  - Added `mapCriticalPreloadPlugin(engineChunk)` (uses `transformIndexHtml` with
    `ctx.bundle` to resolve hashed chunk filenames and inject preload links).
- **`backend/api/routers/news.py`**
  - Added `CACHE_FRESH_KEY`, `CACHE_REFRESH_LOCK`, `CACHE_HARD_TTL`,
    `CACHE_REFRESH_LOCK_TTL`.
  - Split `_fetch_feeds` into `_fetch_one` (per-feed, never raises) +
    concurrent `gather`.
  - Added `_store_feed`, `_refresh_and_release`, `_trigger_refresh`, and a module
    `_refresh_task` ref.
  - Rewrote `get_news_feed` for stale-while-revalidate.
  - Added `warm_cache()` — a non-blocking startup warm that delegates to the
    deduped background refresh.
- **`backend/api/main.py`**
  - Lifespan now calls `news.warm_cache()` after `broadcast_service.start()`, so
    the feed cache is populated in the background at startup and the first
    dashboard load after a restart never blocks on the upstream RSS fetch.
- **`backend/api/tests/test_news_router.py`**
  - Added tests: fresh cache served without refresh; stale cache served +
    triggers refresh; cold cache fetches synchronously; `_fetch_feeds` merges +
    sorts newest-first and strips `_ts`; `_trigger_refresh` NX-lock dedupe.

## Verification

- **Frontend** (`frontend`): `pnpm run typecheck` (covers `vite.config.ts`),
  `pnpm run lint`, `pnpm run test` → 278 passed. `pnpm run build` succeeded;
  `dist/index.html` now contains `modulepreload` links for `deck-gl`,
  `maplibre` (no Mapbox token in this build → engine = MapLibre, and `mapbox`
  is correctly *not* preloaded), and `TacticalMap`.
- **Backend API** (`backend/api`): `ruff check` on changed files passed;
  `pytest` full suite → 172 passed (was 167; +5 news tests).

## Benefits

- **Map paints sooner on a cold client**: the two multi-MB critical chunks and
  the default view chunk download in parallel with the entry, collapsing the
  discover-then-fetch waterfall — without reverting the cacheable vendor split
  or preloading the unused engine.
- **Dashboard text feeds load fast and stay fast**: concurrent fetching cuts
  cold-cache latency from the sum of feed latencies to the slowest single feed,
  and stale-while-revalidate means the periodic 15-minute cache expiry no longer
  blocks a user — they get instant (slightly stale) data while a background
  refresh runs. Background refreshes are deduped so a burst of clients triggers
  at most one upstream fetch.
