# Release - v0.25.0 - Persistence & Stability Unified

## High-Level Summary
This major update introduces **Global COT State Persistence**, a foundational architectural shift that eliminates data loss and loading delays during map view transitions. By hoisting tactical tracking and worker lifecycles to the root application level, operators can now switch between Tactical and Orbital views instantly with zero track interruption. This release also resolves several critical stability issues, including a high-priority state reset bug and type inconsistencies in the rendering engine.

## Key Features
- **Global COT State Persistence**: Tactical tracks and dead reckoning states now persist globally. Switching from the Tactical Map to the Orbital Map and back is now instantaneous, with no re-synchronization overhead.
- **H3 Poller Infrastructure**: Real-time H3-based coverage visualization is now fully integrated with the global state, ensuring consistent spatial awareness of sensor density across all views.
- **System Settings Widget**: Centralized configuration hub for tactical layers and poller toggles, accessible via the "SYS" button.
- **Improved AIS & ADS-B Reliability**: Refined ingestion radii and optimized rendering layers ensure tactical entities are always visible and accurate.

## Fixed
- **App Crash on Filter Change**: Fixed a critical `TypeError` in `App.tsx` where missing return statements in state updaters would crash the UI when toggling map layers.
- **View Transition Latency**: Removed the 5-10 second "re-sync" gap when entering or exiting the Orbital view.
- **Prop Schema Sync**: Standardized ref types and properties (`alertedEmergencyRef`, `repeatersLoading`) across all map components to prevent compilation and runtime mismatches.

## Technical Details
- **Architecture**: `useEntityWorker` and associated `useRefs` hoisted to root `App.tsx`.
- **State Management**: Optimized `setFilters` and `setEvents` updaters with explicit typing and `useCallback` memoization.
- **Frontend**: Standardized `DRState` and `VisualState` types in `types.ts` for clean data flow.

## Upgrade Instructions
1. Pull the latest code:
   ```bash
   git pull
   ```
2. Rebuild the frontend and ingestion pollers:
   ```bash
   docker compose up -d --build frontend adsb-poller maritime-poller orbital-pulse
   ```
3. No database migrations are required for this update.
