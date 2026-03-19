# 2026-03-12-remove-datacenters.md

## Issue
The datacenter data source was broken, leading to errors in the `infra_poller` and potential display issues on the map.

## Solution
Removed all fetching and rendering logic for datacenters across the backend and frontend.

## Changes
- **Backend**:
  - `backend/ingestion/infra_poller/main.py`: Removed datacenter constants, `fetch_datacenters` logic, and polling loop.
  - `backend/api/routers/infra.py`: Removed `/api/infra/datacenters` endpoint.
- **Frontend**:
  - `frontend/src/hooks/useInfraData.ts`: Removed datacenter state and fetching.
  - `frontend/src/layers/buildInfraLayers.ts`: Removed datacenter layer construction.
  - `frontend/src/components/widgets/SystemStatus.tsx`: Removed "DATA CENTERS" filter.
  - `frontend/src/hooks/useAnimationLoop.ts`: Removed `datacentersData` from animation loop and dependencies.
  - `frontend/src/components/map/TacticalMap.tsx`: Removed datacenter data consumption.
  - `frontend/src/components/map/OrbitalMap.tsx`: Removed datacenter data consumption.

## Verification
- Rebuilt `infra-poller` and `backend-api` containers.
- Verified removal of UI elements in `SystemStatus`.

## Benefits
- Cleaner codebase without broken dependencies.
- Improved stability of the `infra_poller` service.
