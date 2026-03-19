# 2026-03-10-global-state-persistence.md

## Issue
Operators experienced significant loading delays (5-10 seconds) when switching between the Tactical Map and Orbital Map views. This was caused by the `useEntityWorker` hook being locally scoped to each map component, forcing a full WebSocket teardown and worker re-initialization on every view transition. Additionally, a critical bug was discovered where changing map filters would crash the `App` component due to an invalid state update.

## Solution
Implemented a root-level global state management strategy for C2S/Tracks (COT) data.
1. **Hoisted Hooks**: Moved the `useEntityWorker` hook and its associated `useRefs` (entities, satellites, dead reckoning state, etc.) to the root `App.tsx` component.
2. **Persistent Refs**: Created global `useRef` objects for all mission-critical telemetry to ensure state survival during map view unmounts.
3. **Prop Propagation**: Refactored `TacticalMap` and `OrbitalMap` to accept these persistent refs as props, turning them into efficient rendering layers that consume existing state rather than managing their own.
4. **State Stability**: Fixed the `handleFilterChange` updater in `App.tsx` explicitly to ensure it returns the next state, and added TypeScript guards to prevent implicit `any` regressions.

## Changes
- **MODIFY** [App.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/App.tsx): Hoisted `useEntityWorker`, fixed `setFilters` bug, added global refs.
- **MODIFY** [TacticalMap.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/components/map/TacticalMap.tsx): Converted to prop-driven model, removed local worker hook.
- **MODIFY** [OrbitalMap.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/components/map/OrbitalMap.tsx): Converted to prop-driven model, removed local worker hook.
- **MODIFY** [types.ts](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/types.ts): Centralized `DRState` and `VisualState` interfaces.
- **MODIFY** [useEntityWorker.ts](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/hooks/useEntityWorker.ts): Exported refined types and modernized ref handling.
- **MODIFY** [package.json](file:///home/zbrain/Projects/Sovereign_Watch/frontend/package.json): Bumped version to `0.25.0`.
- **MODIFY** [CHANGELOG.md](file:///home/zbrain/Projects/Sovereign_Watch/CHANGELOG.md): Added 0.25.0 release notes.
- **MODIFY** [RELEASE_NOTES.md](file:///home/zbrain/Projects/Sovereign_Watch/RELEASE_NOTES.md): Detailed the persistence benefits.

## Verification
- **Manual Verification**: Navigated between Tactical and Orbital maps repeatedly. Confirmed that tracks (planes/ships/satellites) are visible immediately upon switching with zero loading spinner or network delay.
- **Filter Testing**: Toggled various map layers (Air, Sea, Satellites). Confirmed the app no longer crashes and correctly filters entities in real-time.
- **Type Check**: Verified that the frontend builds without errors despite recent interface changes.

## Benefits
- **Zero Latency Navigation**: Instantaneous context switching between system views.
- **Data Integrity**: No track history loss or "teleporting" icons during view changes.
- **Improved Maintainability**: Centralized data management makes it easier to add new map layers or global state features in the future.
