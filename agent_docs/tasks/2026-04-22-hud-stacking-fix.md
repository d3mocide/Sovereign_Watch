# Task: Fix HUD Overlap and Stacking

- **Issue**: The NWS Alerts widget and AI Risk Analyst panels overlap in the top-right corner because they share the same absolute positioning.
- **Solution**: Centralize all top-right map HUD elements into a unified flex container in `App.tsx`.
- **Status**: Planning

## Planned Changes
- [x] Remove HUD widgets from `TacticalMap.tsx` and `OrbitalMap.tsx`.
- [x] Implement `RightMapHudStack` in `App.tsx`.
- [x] Verify stacking and sidebar offset logic.
