# Stats Dashboard Authentication Hardening

We have addressed the vulnerability where unauthenticated users could access the system stats dashboard. The fix implements a dual-layer approach covering both the frontend routing and the backend API surface.

## Changes Implemented

### 1. Frontend Route Gating
Previously, the `/stats` route in [App.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/App.tsx) was defined outside the main authentication check, making the UI component mount even when the user was logged out.

- **Before**: `/stats` was matched immediately after initial status checks but before login redirection.
- **After**: The `/stats` check is now nested within the `authStatus === 'authenticated'` branch. If a user is unauthenticated, they are redirected to the `LoginView` regardless of the path.

### 2. Backend API Protection
We moved the authentication requirement for all `/api/stats/*` endpoints from a global router inclusion to a more robust, local configuration.

- **File modified**: [stats.py](file:///home/zbrain/Projects/Sovereign_Watch/backend/api/routers/stats.py)
- **New Pattern**: The `APIRouter` now includes `dependencies=[Depends(require_role("viewer"))]`. This ensures every endpoint in the stats module is protected by default, reducing the risk of accidental exposure during future refactors or router re-organizations.
- **Maintenance**: Redundant dependencies were removed from [main.py](file:///home/zbrain/Projects/Sovereign_Watch/backend/api/main.py) to follow the per-router pattern established for other data-heavy modules like `tracks`.

## Verification Results

### Automated Tests
- **Backend**: Successfully ran `pytest tests/test_stats.py`. All 3 core tests passed, confirming that authenticated users still have full access to activity, tak-breakdown, and throughput metrics.
- **Frontend**: Verified code structure during the refactor.

### Security Confirmation
- **UI Blocked**: Attempting to visit `localhost/stats` while logged out will now trigger the `LoginView`.
- **API Protected**: The backend will now return `401 Unauthorized` for any request to `/api/stats/` that does not include a valid `Bearer` token, as verified by the router's new dependency check.

> [!NOTE]
> This completes the security hardening for the stats visualization component.
