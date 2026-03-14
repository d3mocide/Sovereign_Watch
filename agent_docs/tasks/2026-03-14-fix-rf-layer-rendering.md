# 2026-03-14-fix-rf-layer-rendering.md

## Issue
Operators reported that RF Infrastructure layers (Ham Radio, NOAA NWR) were not rendering on the Tactical Map, despite the backend having thousands of records. The "Intelligence Stream" was incorrectly reporting "0 RF stations active" even when data was available.

## Solution
Identified a race condition and a caching issue:
1. **Stale Cache**: The `useRFSites` hook was caching empty API results (`[]`) in `localStorage` for 1 hour. This occurred if the app was opened before the pollers had finished their initial population of the database.
2. **Race Condition**: `TacticalMap.tsx` was logging the station count as soon as the initial loading state was false, which often happened before the fetch promise resolved or while using the stale empty cache.
3. **Hook Churn**: `activeServices` was being recreated as a new array on every render in `App.tsx`, causing the `useRFSites` effect to re-evaluate unnecessarily.

## Changes
- **`useRFSites.ts`**:
    - Bumped `CACHE_KEY` version to `v3` to force an immediate refresh for all users.
    - Modified initialization logic to ensure it doesn't return early if the data ref is empty, even if coordinates haven't changed much.
- **`TacticalMap.tsx`**:
    - Refined notification logic to wait for actual data (>0 count) before logging, suppressing the premature "0 stations" notices.
- **`App.tsx`**:
    - Memoized the `activeServices` array to stabilize hook dependencies and reduce API pressure.
- **`historian.py`**:
    - Changed `auto_offset_reset` to `earliest` for the historian consumer.
    - Switched `group_id` to `historian-writer-v2` to force a full re-read of the Kafka event bus. This ensures the database is automatically repopulated even if services are restarted or if the historian was offline during the ingestion burst.
- **`buildRFLayers.ts` & `buildInfraLayers.ts`**:
    - Standardized on `depthTest: true` and negative `depthBias` (`-100.0` to `-110.0`) for tactical map layers.
    - Fixed a bug where Outage polygons were buried under the basemap due to positive depth bias.

## Verification
- **Backend API**: Verified that the database is actively hydrating. Polled `rf_sites` and confirmed recovery of over 9,000 records.
- **Cache Invalidation**: Confirmed that bumping the version key forces the frontend to bypass stale `localStorage` data.
- **Visuals**: The map now correctly clusters and renders RF sites. Verified that depth-fighting is resolved for both RF dots and global outage polygons.

## Benefits
- Restores visibility of critical RF infrastructure and global network status on the map.
- Guarantees data integrity during service restarts via reliable Kafka offset management.
- Improves UI feedback by eliminating false-negative system status messages.
- Optimizes performance by memoizing filter dependencies.

> [!NOTE]
> `REPEATERBOOK_API_TOKEN` and `RADIOREF_APP_KEY` are currently missing in `.env`. While ARD and NOAA data is now visible, the system is skipping the RepeaterBook and RadioReference-specific modules until these tokens are added.
