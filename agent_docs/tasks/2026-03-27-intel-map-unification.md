# 2026-03-27-intel-map-unification.md

## Issue

The Intel Map (OSINT Globe) UI was fragmented, containing redundant sidebar controls for map style, projection modes, and auto-spin that didn't follow the "Sovereign Glass" design philosophy of the Tactical and Orbital maps. Additionally, legacy "debugMode" logic was still present in map layer builders, causing unnecessary complexity and rendering inconsistencies.

## Solution

- Consolidated all map-specific controls (style, mode, perspective, auto-spin) directly into the map viewport using the shared `MapControls` HUD component.
- Simplified `IntelSidebar` to focus exclusively on data aggregation (Conflict Zones, Active Actors) and SITREP generation.
- Sunsetted `debugMode` across all GDELT and Country Heat map layer builders, unifying depth testing and z-ordering logic.
- Migrated map view state (projection and style) from `App.tsx` into `IntelGlobe.tsx` for better component encapsulation.

## Changes

### Frontend

- **IntelSidebar.tsx**: Removed redundant "STYLE" and "MODE" selector buttons. Cleaned up props and removed deprecated `spin` and `renderer` logic.
- **IntelGlobe.tsx**: Refactored to manage its own style, projection, and spin state. Integrated with the updated `MapControls` HUD.
- **MapControls.tsx**: Added optional `spin` and `onToggleSpin` props to support auto-rotation directly from the HUD.
- **App.tsx**: Removed deprecated props from `IntelGlobe` and `IntelSidebar` instantiations. Cleaned up unused state and handlers.
- **SidebarRight.tsx**: Silenced the right sidebar for 'sitrep' entities to favor the AI Analyst panel.
- **Layer Builders**: Removed `debugMode` parameter and associated conditional logic from `buildGdeltLayer.ts`, `buildCountryHeatLayer.ts`, and `buildGdeltArcLayer.ts`. Increased the height and volume of GDELT arc lines for better 3D presence.

## Verification

- **Linting**: Run `pnpm run lint` in the `frontend` directory. Result: Passed.
- **Unit Tests**: Run `pnpm run test` in the `frontend` directory. Result: Passed (36 tests).
- **Manual Check**: Verified component interfaces and prop-types for consistency across the HUD.

## Benefits

- **Visual Consistency**: The Intel view now matches the premium tactile experience of the rest of the application.
- **Architecture**: Improved encapsulation by moving map-specific UI state closer to the rendering logic.
- **Performance**: Cleaner layer builders reduce branching logic during the animation loop.
- **UX**: Sidebar is now less cluttered, and Intel Sitrep generation is focused solely on the AI Analyst interface.
- **Aesthetics**: Higher, more volumetric arc lines provide a majestically topographic 3D look.
