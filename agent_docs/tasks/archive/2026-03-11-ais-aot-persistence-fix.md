# 2026-03-11-ais-aot-persistence-fix.md

## Issue
The AIS AOT boundary box (blue box) would disappear when switching between the Tactical Map and other tabs (Orbital, Radio). This happened because the `useMissionArea` hook, which manages the mission state and AOT shapes, reset its local `currentMission` state to `null` on every remount. Although it eventually synced with the backend, there was a visible delay where the maritime AOT was missing.

## Solution
Initialize the `currentMission` state in `useMissionArea` using the value from the shared `currentMissionRef`. This ref is maintained across component remounts in the parent `App` component, ensuring that the mission state is instantly available when the `TacticalMap` is remounted.

## Changes

### [Frontend]

#### [useMissionArea.ts](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/hooks/useMissionArea.ts)
- Changed the initial state of `currentMission` from `null` to `currentMissionRef.current`.

## Verification
- Code review: The shared ref `currentMissionRef` is passed from `App` to `TacticalMap` and then to `useMissionArea`, so it is guaranteed to have the last known mission state.
- Linting: `npm run lint` was executed to ensure no new issues were introduced.

## Benefits
- Improved UI persistence and user experience: The mission boundaries are now instantly visible when returning to the tactical map, providing a seamless transition between different views of the platform.
- Consistency: The AIS AOT now behaves more like the ADS-B AOT which already had a fallback mechanism.
