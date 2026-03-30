# Task: Infrastructure Ingestion and UI Stability

## Issue
1. **Infra Data Ingestion**: Internet Exchange Points (IXPs) were failing to populate because they lacked coordinate data in the PeeringDB API.
2. **ISS Tracker**: Intermittent `asyncio.TimeoutError` and `CancelledError` during network fetch.
3. **UI Layout**: Toggling the "Map Layers" filters (specifically newer ones like Data Centers) caused the widget to collapse or layout to break (black gaps).
4. **Sidebar Right**: Missing detailed views for IXPs and Data Centers.

## Solution

### Backend (InfraPoller)
-   Implemented a secondary fetch for PeeringDB `/api/ixfac` to map IXPs to physical facilities with coordinates.
-   Created a robust `fetch_api` helper with:
    -   Exponential backoff for 429 rate limits.
    -   Redis-based caching (24-hour TTL) for all PeeringDB and Open-Notify (ISS) calls.
    -   Centralized 45s timeout configuration.

### Frontend (UI)
-   **Stability**: Removed the `key` prop from `SystemStatus` in `SidebarLeft.tsx` to prevent component re-mounting during filter state updates.
-   **Event Propagation**: Added `e.stopPropagation()` to all sub-filters in `LayerVisibilityControls.tsx`.
-   **Sidebar Right**: Updated `InfraView.tsx` and its types to support specific layout and metadata for `ixp` and `facility` types.
-   **Layout**: Adjusted `SidebarLeft` flex usage to ensure `SystemStatus` remains compact at the bottom without stretching.

## Changes

### 1. Ingestion Poller
-   `backend/ingestion/infra_poller/main.py`: Updated `_fetch_and_ingest_peeringdb` and added `fetch_api`.

### 2. Frontend Layout & Widgets
-   `frontend/src/components/layouts/SidebarLeft.tsx`: Fixed re-mounting and stretching.
-   `frontend/src/components/widgets/LayerVisibilityControls.tsx`: Fixed event bubbling.
-   `frontend/src/components/layouts/sidebar-right/InfraView.tsx`: Added IXP/Data Center states.
-   `frontend/src/components/layouts/sidebar-right/types.ts`: Added missing infra properties.

## Verification
-   **Data Check**: `SELECT count(*) FROM peeringdb_ixps;` -> **871 records** (Success).
-   **ISS Status**: Verified "ISS pos reported" in container logs.
-   **Frontend Tests**: `docker exec sovereign-frontend pnpm run lint && pnpm run test` -> **PASS**.
-   **Manual Walkthrough**:
    -   Verified "Map Layers" remains expanded during filter toggles.
    -   Verified Sidebar Right shows "INTERNET_EXCHANGE" with PeeringDB links.
    -   Verified Sidebar Right shows "DATA_CENTER" with operator info.

## Benefits
-   Full global visibility of internet infrastructure on the map.
-   Resilient ingestion poller that handles rate limits and network lag.
-   Smooth, stable HUD interface for layer management.
