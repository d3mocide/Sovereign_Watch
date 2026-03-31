# Task: Enhanced Role-Based Access Control (RBAC) Expansion

**Date**: 2026-03-31

## Issue
Initially, the `/stats` dashboard and several mission-critical operational tools (Mission Area, Watchlist, Filter Presets) were accessible to all authenticated users, including those with only the `viewer` role. This posed a security risk where unintended users could modify the global surveillance state or view sensitive system metrics.

## Solution
We implemented a tiered RBAC system across the frontend HUD and backend API:
1.  **Administrator Level**: The `/stats` dashboard and `/api/stats/*` endpoints were strictly limited to the `admin` role.
2.  **Operator Level**: Mission area updates, global watchlist management, and filter preset modifications were limited to the `operator` role (and higher).
3.  **Viewer Level**: The HUD was updated to hide modification controls for `viewer` users, ensuring a strictly read-only intelligence experience.

## Changes

### Backend API (`system.py` & `stats.py`)
-   **[MODIFY] [stats.py](file:///home/zbrain/Projects/Sovereign_Watch/backend/api/routers/stats.py)**: Applied `require_role("admin")` to the router dependency.
-   **[MODIFY] [system.py](file:///home/zbrain/Projects/Sovereign_Watch/backend/api/routers/system.py)**: Applied `require_role("operator")` to `set_mission_location`, `add_to_watchlist`, and `remove_from_watchlist` endpoints.

### Frontend HUD (React)
-   **[MODIFY] [App.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/App.tsx)**: Gated the stats dashboard route.
-   **[MODIFY] [SystemHealthWidget.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/components/widgets/SystemHealthWidget.tsx)**: Gated the "STATS" button.
-   **[MODIFY] [FilterPresets.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/components/widgets/FilterPresets.tsx)**: Hidden Save, Delete, and Import/Export for non-operators.
-   **[MODIFY] [MissionNavigator.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/components/widgets/MissionNavigator.tsx)**: Hidden Preset selection and mission deletion for non-operators. Added a "Mission Configuration: Operator Only" lock indicator.
-   **[MODIFY] [WatchlistManager.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/components/widgets/WatchlistManager.tsx)**: Hidden Add ICAO24 and delete buttons for non-operators. Added a "Monitoring: Synchronized" shield indicator.
-   **[MODIFY] [MapContextMenu.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/components/map/MapContextMenu.tsx)**: Hidden "Set Focus" and "Save Location" for non-operators. Added a "Modify Area: Operator Only" lock indicator.

## Verification
-   **Backend**: Confirmed that `viewer` and `operator` receive `403 Forbidden` on admin-only endpoints. Confirmed that `viewer` receives `403 Forbidden` on operator-only endpoints.
-   **Frontend**: Confirmed that the HUD now dynamically hides controls based on the JWT role payload.

## Benefits
-   **Security**: Critical system metrics are no longer exposed to unprivileged users.
-   **Integrity**: The shared surveillance mission state can no longer be modified by low-privileged accounts.
-   **Clarity**: Visual indicators (Lock/Shield) clearly communicate the user's current session permissions.
