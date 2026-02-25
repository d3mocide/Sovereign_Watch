
# Jules Changes

# Security Fix: Tracks History Validation

## Issue
The `get_track_history` endpoint in `backend/api/routers/tracks.py` lacked input validation for `limit` and `hours` query parameters. This could allow excessive data retrieval, potentially leading to Denial of Service (DoS) or performance degradation.

## Solution
Implemented input validation to enforce maximum limits on `limit` and `hours`.

## Changes
1.  **Configuration:** Added `TRACK_HISTORY_MAX_LIMIT` (default: 1000) and `TRACK_HISTORY_MAX_HOURS` (default: 72) to `backend/api/core/config.py`. These are configurable via environment variables.
2.  **Implementation:** Updated `get_track_history` in `backend/api/routers/tracks.py` to:
    *   Check if `limit` exceeds `TRACK_HISTORY_MAX_LIMIT`.
    *   Check if `hours` exceeds `TRACK_HISTORY_MAX_HOURS`.
    *   Return `400 Bad Request` if limits are exceeded.
3.  **Testing:** Added `backend/api/tests/test_tracks_validation.py` to verify validation logic.

## Verification
Tests confirm that requests exceeding limits are rejected with `400 Bad Request`, while valid requests proceed (returning 503 if DB is not ready, or 200 otherwise).

# Code Health Improvement: Hardcoded Kafka Broker Configuration

## Issue
The Kafka broker address was hardcoded as `'sovereign-redpanda:9092'` in `backend/api/routers/tracks.py` and `backend/api/services/historian.py`. This prevented configuration via environment variables, which is standard practice for containerized applications.

## Solution
1.  **Configuration Update**: Added `KAFKA_BROKERS` to the `Settings` class in `backend/api/core/config.py`. It defaults to `'sovereign-redpanda:9092'` but can be overridden by the `KAFKA_BROKERS` environment variable.
2.  **Refactoring**: Updated `backend/api/routers/tracks.py` and `backend/api/services/historian.py` to use `settings.KAFKA_BROKERS`.

## Verification
-   Ran existing tests (`pytest backend/api/tests/test_cors.py`).
-   Verified that the `settings` object correctly loads the default value.
-   Verified that the refactored modules can be imported without errors.

## Benefits
-   **Configurability**: The application can now be deployed in different environments with different Kafka broker addresses without code changes.
-   **Maintainability**: The Kafka broker address is defined in a single place (`backend/api/core/config.py`), reducing duplication and the risk of inconsistencies.

## 2024-05-24: Fix Globe Mode Icon Rendering

### Problem
In Globe projection mode, entity icons (aircraft/vessel chevrons) and satellite markers (diamonds) were failing to render. This was caused by a conflict between Deck.gl's `IconLayer` properties when `billboard: true` is combined with `wrapLongitude: true` in the Globe view. Additionally, conflicting `depthTest` settings in the tactical halo and heading arrow layers exacerbated the issue.

### Solution
- **`frontend/src/layers/buildEntityLayers.ts`**:
    - Disabled `wrapLongitude` for `heading-arrows` and `entity-tactical-halo` layers when `globeMode` is active.
    - Forced `depthTest: false` for `heading-arrows` to ensure icons always render on top of the terrain, aligning with the inline comments.
- **`frontend/src/layers/OrbitalLayer.tsx`**:
    - Disabled `wrapLongitude` for `satellite-markers` when the projection mode is 'globe'.
- **`frontend/src/layers/buildJS8Layers.ts`**:
    - Disabled `wrapLongitude` for `js8-labels` in Globe mode to prevent billboarding conflicts.

### Verification
- **Scenario**: Switch to Globe view.
- **Expected**: Aircraft chevrons, Vessel chevrons, and Satellite diamonds should now appear correctly on the globe surface, maintaining their billboard orientation towards the camera without z-fighting or disappearance.
