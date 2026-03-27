# 2026-03-27-intel-map-perf-and-sitrep-logic

## Issue

1.  **SITREP Failure & Regression**: Running an "Intel Sitrep" resulted in data transmission failures and eventually triggered a 500 Internal Server Error for all analysts due to a dictionary access regression in the backend.
2.  **Rotation Jitter**: The Intel Map (Globe) and Situational Globe exhibited stutter/jitter during automatic rotation due to `setViewState` triggering full React re-renders every frame.
3.  **UI "Ghosting"**: Closing the SITREP panel left a lingering empty right sidebar state that interfered with HUD interactive layers.

## Solution

1.  **Dynamic Context-Aware Analytics**: 
    - Refactored the frontend to extract and transmit OSINT situational data as a formatted string payload.
    - Updated the backend to intelligently handle both GeoJSON and string contexts, preventing schema validation failures.
    - Fixed a critical `asyncpg.Record` attribute error by converting database rows to standard dictionaries before processing.
2.  **Contextual UI Refinement**: 
    - Enhanced the `AIAnalystPanel` to dynamically switch personas/theming based on the target (Strategic vs. Tactical).
    - Implemented a clean-exit handler in `App.tsx` to clear global selections and suppress ghost sidebars when closing virtual entities.
3.  **Imperative Animation Loop**: Refactored `IntelGlobe` and `SituationGlobe` to update the MapLibre instance directly during spins via `map.jumpTo()`, achieving fluid 60FPS motion.

## Changes

- **Backend API**:
  - `models/schemas.py`: Relaxed `sitrep_context` validation to support flexible string/dict payloads.
  - `routers/analysis.py`: Implemented robust SITREP detection, row-to-dict conversion, and strategic persona mapping.
- **Frontend**:
  - `App.tsx`: Resolved the "Ghost Sidebar" bug and implemented global selection clearing for SITREPs.
  - `components/widgets/AIAnalystPanel.tsx`: Added dynamic theming, title/label switching, and mode-locking for strategic reports.
  - `api/analysis.ts` & `hooks/useAnalysis.ts`: Integrated situational context transmission.
  - `components/map/IntelGlobe.tsx` & `SituationGlobe.tsx`: Implemented imperative animation loops for jitter-free rotation.

## Verification

- **SITREP**: Confirmed 200 OK with rich strategic assessment generated from the local OSINT buffer.
- **Tactical**: Confirmed normal COT tracks (e.g. `ASA720`) no longer 500 and still provide tactical behavioral alerts.
- **Performance**: Observed smooth 60FPS rotation on both planetary globes.

## Benefits

- Rock-solid stability for the AI Analyst pipeline across all entity types.
- Professional-grade UI transitions and context-aware intelligence presentation.
- Fluid, premium map visuals that align with current hardware acceleration standards.
