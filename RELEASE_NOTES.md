# Release - v0.51.0 - Map Architecture Refactor

This release introduces a significant architectural refactoring of the mapping system, focusing on code reuse, performance optimization, and UI standardization across all mission views.

## High-Level Summary
We have consolidated the map initialization and control logic that was previously duplicated across our three main mapping interfaces (Tactical, Orbital, and Intel). By extracting this boilerplate into shared hooks and components, we've improved maintainability and ensured that features like URL synchronization and globe-mode transitions behave identically everywhere. Additionally, a new "ref-sync" pattern in our animation loops eliminates dozens of unnecessary React state updates per second, providing a smoother, more efficient rendering experience.

## Key Features
- **Unified Map Foundation**: All maps now use the `useMapBase` hook for consistent initialization and state management.
- **Shared HUD Controls**: A new `MapControls` component provides a standardized interface for zooming, projection switching, and styling.
- **Performance Boost**: IntelGlobe rendering is now significantly more efficient thanks to optimized animation loop handling.
- **Enhanced Visuals**: Improved alpha blending for satellite imagery provides better contrast for tactical overlays.

## Technical Details
- **Boilerplate Reduction**: Removed ~150-200 lines of duplicated code per map component.
- **Adapter Portability**: Centralized Mapbox vs. MapLibre selection logic ensures reliable fallback behavior.
- **Ref-Sync Pattern**: High-frequency updates now bypass React's virtual DOM reconciliation for better performance.

## Upgrade Instructions
1. Pull the latest changes from the `dev` branch.
2. Reinstall dependencies in the frontend: `cd frontend && pnpm install`.
3. Rebuild the frontend container: `docker compose up -d --build sovereign-frontend`.
