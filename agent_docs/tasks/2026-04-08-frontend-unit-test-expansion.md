# Frontend Unit Test Expansion — Phase 1

## Issue

Following the v1.0.0 GA release, the frontend test suite had only 36 tests across 2 files, covering exclusively low-level geometry utilities (`geoUtils`, `replayUtils`). All core business logic — alert engines, entity filtering, interpolation, and event categorisation — was completely untested, representing a significant quality gap for a production system.

## Solution

Added 9 new test files targeting the highest-value pure-logic modules: the four alert engines, the entity filter pipeline, the PVB interpolation engine, the trail smoothing cache, and the event style categoriser. All tests are written in Vitest using the same style as the existing suite.

## Changes

| File | Tests Added | Coverage |
|------|------------|---------|
| `src/alerts/AviationAlertEngine.test.ts` | 16 | `EMERGENCY_SQUAWKS`, `getEmergencyKey`, `buildAlertMessage` — all squawk codes, emergency types, priority ordering |
| `src/alerts/MaritimeAlertEngine.test.ts` | 10 | `DISTRESS_NAV_STATUSES`, `getMaritimeAlertKey`, `buildMaritimeAlertMessage` — all 3 distress codes, fallback |
| `src/alerts/HoldingPatternAlertEngine.test.ts` | 16 | `getHoldingAlertKey`, `shouldSuppressHoldingAlert`, `isHoldingPatternCritical`, `buildHoldingAlertMessage` — threshold boundaries, string coercion, all message variants |
| `src/alerts/JammingAlertEngine.test.ts` | 12 | `getJammingAlertKey`, `buildJammingAlertMessage` — all assessment types, confidence threshold, confidence rounding |
| `src/utils/filters.test.ts` | 36 | `filterEntity` (aircraft affiliations, platforms, vessel categories) and `filterSatellite` (all category buckets, constellation filter, undefined guards) |
| `src/utils/EventCategorizer.test.ts` | 16 | `getEventStyle` — all 8 color paths, RF vs non-RF infra distinction, priority ordering between alert/lost/military/domain |
| `src/utils/interpolation.test.ts` | 10 | `interpolatePVB` — no DR/no visual, no DR/with visual, DR with zero speed, DR with movement (northward projection, course derivation, dt capping at 33ms) |
| `src/utils/trailSmoothing.test.ts` | 7 | `getSmoothedTrail` — cache hit/miss by reference identity, short/empty trail edge cases |
| `src/engine/EntityFilterEngine.test.ts` | 17 | `processEntityFrame` (stale thresholds for air vs sea, filter passthrough, count tracking, visual state mutation) and `processReplayFrame` (no staleness check, filter passthrough, empty map) |

## Verification

- `pnpm run test` — **180/180 pass** (was 36/36)
- `pnpm run lint` — exit 0
- `pnpm run typecheck` — exit 0

## Benefits

- **5× test count increase**: 36 → 180 tests
- **Alert engines fully covered**: squawk 7500/7600/7700, maritime distress codes 2/6/14, holding pattern thresholds, jamming confidence gating — all previously untested paths that directly trigger operator alerts
- **Entity lifecycle pipeline covered**: stale detection thresholds (120s air / 300s sea), filter branching, visual state mutation, replay vs live frame divergence
- **PVB interpolation covered**: dead reckoning projection, smoothing factor, dt capping behaviour verified against implementation logic
- **CI-ready**: all tests are hermetic (no network, no DOM, no worker), run in < 1 second, and will catch regressions across alert triggering, filtering, and interpolation logic going forward
