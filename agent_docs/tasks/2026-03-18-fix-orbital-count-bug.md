# 2026-03-18-fix-orbital-count-bug.md

## Issue
The orbital object count in the UI was fluctuating inconsistently. Specifically, when toggling orbital filters, the count would often jump from 0 to its full value (e.g., 1579) and back, creating a "flickering" effect. Additionally, the AI Analyst panel sometimes failed to auto-run when opened from the Orbital view.

## Solution
1. **Count Stabilization**: Added a guard in `useAnimationLoop.ts` to prevent "zero-flicker" during loop restarts. The app now only updates counts if they represent a legitimate state change or a non-zero detection, preventing mid-loop 0s from reaching the UI.
2. **Prop Stability**: Memoized the `tacticalFilters` and `orbitalFilters` in `App.tsx` and updated props to use stable setter references. Removed redundant clearing of state in `useMissionArea.ts` that was causing race conditions.
3. **Analyst Reliability**: Re-implement the auto-run logic in `AIAnalystPanel.tsx` using a state-tracking ref to ensure the analysis triggers correctly when the panel is opened, even if the selected entity data arrives in a separate render cycle.
4. **Text Formatting**: Improved the `AnalysisFormatter` to collapse spacing artifacts around apostrophes and connectors (e.g., fixing "it ' s" to "it's").

## Changes
- `frontend/src/App.tsx`: Memoized filter objects and stabilized map props. Corrected `handleSetSelectedSatNorad` to properly sync with the global entity select.
- `frontend/src/hooks/useAnimationLoop.ts`: Added high-frequency count guard and fixed missing TypeScript imports (`GroundTrackPoint`, `H3CellData`).
- `frontend/src/hooks/useMissionArea.ts`: Removed redundant asynchronous clearing of trackers that was clashing with the map's own animation loop.
- `frontend/src/components/widgets/AIAnalystPanel.tsx`: Refactored auto-run logic and enhanced regex for cleaning LLM output artifacts.
- `frontend/src/components/map/OrbitalMap.tsx`: Fixed `observerRef` dependency array.

## Verification
- Verified ORBITAL count stability while toggling category filters (GPS, Comms, etc.).
- Confirmed total tracking count no longer jumps to zero when mission areas switch or filters pulse.
- Verified AI Analyst auto-triggers correctly for satellites and output contains correctly formatted apostrophes.

## Benefits
- Significantly smoother UI experience with stable, flicker-free tracking telemetry.
- Reduced CPU overhead by eliminating redundant map re-renders.
- More reliable AI analysis features for global tactical awareness.
