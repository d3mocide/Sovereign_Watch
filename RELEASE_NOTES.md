# Release - v0.46.3 - Sidebar Modularization & GDELT Fidelity Fixes

## High-Level Summary

This patch release focuses on maintainability and intelligence-display correctness. The right sidebar has been decomposed from a monolithic component into focused domain views with explicit shared types, and GDELT actor/tone rendering has been corrected end-to-end so sidebar and tooltip metrics match backend payloads and map color semantics.

## Key Features

- **SidebarRight Decomposition**: Split the previous 1,866-line `SidebarRight.tsx` into focused view modules under `sidebar-right/`:
  - `JS8View`, `RepeaterView`, `TowerView`, `InfraView`, `GdeltView`, `SatelliteView`, `ShipView`, `AircraftView`.
- **Thin Orchestrator Pattern**: `SidebarRight.tsx` now routes by entity type and passes `key={entity.uid}` to each view, eliminating previous `prevUid` / state-reset anti-patterns.
- **Shared Sidebar Contracts**: Added `sidebar-right/types.ts` with `BaseViewProps`, `SatelliteViewProps`, `AircraftViewProps`, `InfraDetail`, and `InfraProperties`.
- **GDELT Actor 1 Integrity**: `actor1` is now included in backend GeoJSON properties and mapped through frontend GDELT layer typing.
- **Tooltip Metric Consistency**: GDELT `TONE (GS)` and `STATUS` now use Goldstein scale (`goldstein`) instead of average tone (`tone`), matching map dot color logic.

## Technical Details

- **Frontend**:
  - Refactored sidebar detail rendering into per-domain components under `frontend/src/components/layouts/sidebar-right/`.
  - Added per-view local state ownership and deterministic state reset on entity change via `key={entity.uid}`.
  - Updated GDELT layer interfaces/mapping to include `actor1` in `GdeltFeature.properties` and `GdeltPoint`.
  - Updated `MapTooltip.tsx` GDELT section to drive value/status thresholds from `goldstein` and use nullish coalescing for zero-safe display.
- **Backend API**:
  - Updated `backend/api/routers/gdelt.py` GeoJSON property mapping to include `"actor1": r["actor1"]`.

## Upgrade Instructions

1. **Pull latest source and tags**
   ```bash
   git pull origin main --tags
   ```

2. **Rebuild and restart affected services**
   ```bash
  docker compose up -d --build sovereign-backend sovereign-frontend sovereign-nginx
   ```

3. **Run targeted frontend verification**
   ```bash
   cd frontend
  pnpm run lint
  pnpm run test
   ```

4. **Run targeted backend API verification**
  ```bash
  cd backend/api
  ruff check .
  python -m pytest
  ```

5. **Validate GDELT API payload shape (optional sanity)**
   ```bash
   curl "http://localhost/api/gdelt/events?refresh=true&limit=5"
   ```
