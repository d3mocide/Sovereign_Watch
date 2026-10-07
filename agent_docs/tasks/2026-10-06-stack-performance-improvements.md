# Stack performance improvements

## Issue

Implement the five improvements identified in the running-stack assessment:
metrics event-loop stalls, slow orbital sweeps, repeated live-message conversion
and unbatched snapshots, missing database query attribution, and browser profiling.

## Solution

Sample system metrics in a background task with host calls offloaded to a thread,
reuse Kafka clients, publish compact orbital TAK Protobuf once with gzip batching,
forward binary frames directly, batch initial snapshots, enable query statistics,
and provide isolated browser profiles. Keep retained legacy messages readable.

## Changes

- API `services/system_metrics.py`, metrics router, and application lifecycle:
  sample every five seconds, cache for fifteen, reuse Kafka admin/consumer clients,
  bound lag reads to three seconds, serialize cold requests, and serve warm
  snapshots without waiting for the next sample.
- Space service `telemetry.py`, producer, and orbital source: authoritative shared
  TAK schema, typed orbital metadata without duplicated raw JSON, 128 KiB producer
  batches, gzip, 10 ms linger, no artificial per-tranche delay, explicit delivery
  flush, configurable 15-second cadence, compute/publish/byte logging.
- Space Dockerfile now copies its lockfile and installs strictly frozen
  dependencies. Its Docker ignore excludes host virtualenvs. Compose mounts the
  shared schema read-only and persists its approximately 2 MiB orbital cache in
  `sovereign-vol-space-cache`, seeded from the existing live catalog.
- API TAK decoder and broadcast forward binary payloads unchanged, retain JSON
  compatibility, and coalesce snapshots using existing 128-record/60 KiB bounds.
  Historian skips position-only binary orbital records; legacy catalog upserts
  and other domains remain supported.
- PostgreSQL preload configuration and migration V007 enable
  `pg_stat_statements`; `tools/storage/query-profile.sql` reports normalized query
  costs without resetting production statistics.
- Frontend Protobuf decoding preserves zero values. WorkerProtocol waits for
  schema readiness before connecting, preventing early snapshot loss. The night
  polygon adaptively samples steep equinox sections to preserve globe curvature.
  Playwright configuration now uses the actual Vite port (3700).
- `tools/performance/browser-profile.cjs` and README provide isolated mocked-auth,
  mocked-API, blank-basemap, synthetic TAK profiles for both engines and views.
- Crash-dump ignore patterns were narrowed to avoid hiding the legitimate
  `backend/api/core/` source directory.
- Regression tests cover binary forwarding, compatibility, snapshot batching,
  orbital wire fields, metrics scheduling/single-flight, and worker readiness.

## Verification

- API: 250 tests passed. After the warm-cache scheduling refinement, the 21
  affected tests passed again. Space: 65 passed, one external integration test
  skipped. Frontend: lint and type checking passed; 291 tests passed.
- Final Python full-tree Ruff runs report 767 API and 54 space issues (HEAD
  baseline: 781 API and 54 space),
  including existing import ordering, typing, broad exception handling, and
  unused directives. These gates remain unresolved; this task does not claim
  clean full-tree Python lint. New Python sampler/wire/test files pass targeted
  Ruff checks.
- Compose configuration and Git whitespace checks pass. Production API, space,
  and frontend images built; services recreated, ingestion rebuilt/restarted,
  all fourteen long-running Compose services running and applicable health
  checks healthy. UI responds HTTP 200. V007 applied successfully, both preload
  libraries active, query statistics populated.
- Live metrics experiment: maximum 10 ms ticker gap decreased from 203.38 ms
  before the change to 12.17 ms with cold sampling; warm collection 0.294 ms.
  Initial Kafka connection establishment still makes a cold sample expensive;
  normal requests use the background snapshot.
- Live orbital sweeps: 12,728 valid satellites, usually 0.91–1.03 seconds versus
  approximately 35 seconds before; 1.49–1.55 seconds during concurrent builds
  still fits the target cadence. Computation about 0.04 seconds; remainder is
  encoding/publishing. Wire payload about 2,501,640 bytes per sweep before gzip.
- Sampled 500 live binary records average 193.55 bytes; 500 retained legacy JSON
  records average 778.41 bytes. Different retained samples, not a controlled
  byte-for-byte comparison. Live 500-entity snapshot becomes four frames
  (largest 25,731 bytes). Unit tests assert record order and disconnect handling.
- Recreated space service primed all 12,728 satellites from persisted local
  cache, confirming the cache survives rebuild/restart.
- Initial query attribution identifies a recent-clausal-history distinct-UID
  query averaging 1,687 ms over four startup-period calls, plus track-history
  calls around 382 ms. This is a next investigation target, not justification
  for an unmeasured index change.

- Browser profiles for Mapbox and MapLibre are saved under
  `agent_docs/tasks/performance-2026-10-06/`. With 200 aircraft and 1,000
  satellites, the worker decoded all 1,200 records on both engines; Tactical
  counted the expected 200 aircraft (satellite visibility is off in that view).
  Mapbox canvas startup 15.65 seconds; MapLibre 9.16 seconds with a Vite
  dependency reload. Maximum main-thread tasks were about 12–13 seconds;
  observed software GPU usage reached approximately 470% of one CPU core.
  These are software-rendering/startup diagnostics, not comparable physical
  GPU benchmarks. The extended Orbital attempt did not complete reliably in
  this headless environment. Full-catalog/hardware globe performance remains
  unmeasured; the harness supports an optional Orbital case for that follow-up.
  Neither successful Tactical case reported a page exception; remote font and
  Mapbox telemetry failures are intentional mock isolation.
- Post-deployment check: all fifteen database retention jobs last succeeded,
  `/health` returns `{"status":"ok"}`, disk-write collector active, and the
  updated frontend and ingestion containers have zero restarts.

## Benefits

Restores orbital cadence with substantial headroom, reduces bytes and repeated
conversion, reduces connection overhead, prevents initial snapshot loss, keeps
API scheduling responsive, and makes future database/browser tuning measurable.
Disk-write collection remains active; builds and browser setup contaminate the
short-term write baseline. Use 24–72 hours of steady operation for endurance
projections; the VMware guest still cannot expose physical SSD wear.
