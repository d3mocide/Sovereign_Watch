# 2026-03-20 - AI Analyst Infrastructure Fallbacks & Docker Harmonization

## Issue
1. **AI Analyst Limitation**: The AI Analyst previously failed to generate assessments for entities lacking time-series track data (e.g., static towers, satellites without recent telemetry, cable landing stations).
2. **Docker Inconsistency**: Service names in `docker-compose.yml` did not always match `container_name`, and networks/volumes used generic internal names, causing confusion during CLI operations (e.g., `docker compose up backend` failed because the service was named `backend-api`).

## Solution
1. **Analyst Fallbacks**: Modified the `analyze` endpoint to detect infrastructure and orbital entities without track data and automatically synthesize a "waypoint history" based on their known static locations. This enables full fusion analysis (nearby RF, satellites, etc.) for non-moving assets.
2. **Docker Harmonization**: Renamed all 12+ services to match their `container_name` exactly. Renamed all networks to `sovereign-net-*` and volumes to `sovereign-vol-*`. Named the previously anonymous `node_modules` volume to prevent hashed volume clutter.

## Changes
- `backend/api/routers/analysis.py`:
  - Added detection for `SAT-`, `TOWER-`, `RF-`, and `INFRA-` prefixes in the analysis request.
  - Implemented lookup logic for each type in the database or Redis.
  - Generates a synthetic `waypoint_history` containing the entity's current location to satisfy the fusion engine's spatial requirements.
- `docker-compose.yml`:
  - Renamed service keys (e.g., `backend-api` -> `sovereign-backend`).
  - Updated all `depends_on` references to use the new service names.
  - Renamed `networks` to `sovereign-net-frontend`, `sovereign-net-backend`, `sovereign-net-ai`.
  - Renamed `volumes` to `sovereign-vol-redpanda`, `sovereign-vol-postgres`, `sovereign-vol-redis`.
  - Added `sovereign-vol-frontend-node-modules` as a named volume and mapped it to `/app/node_modules` in the frontend service.

## Verification
- **Analyst**: Verified that clicking "AI ANALYST" on an FCC Tower now successfully generates a report (including nearby intelligence fusion) instead of an error.
- **Docker**: Confirmed `docker compose build` and `docker compose up` work using the new `sovereign-` service names. Verified that `docker volume ls` no longer spawns new anonymous hashes for the frontend.

## Benefits
- **Analyst**: Provides 100% coverage for all entity types on the map, ensuring no "dead ends" in the intelligence workflow.
- **Docker**: Improved developer experience with intuitive, consistent naming and better resource management.
- **System Stability**: Standardized internal routing and volume persistence.
