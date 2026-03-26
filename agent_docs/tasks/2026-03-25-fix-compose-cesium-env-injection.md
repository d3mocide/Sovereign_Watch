# 2026-03-25 - Fix Compose Cesium Env Injection

## Issue
Setting `VITE_CESIUM_GLOBE=true` in root `.env` did not activate Cesium rendering because `sovereign-frontend` container was not receiving `VITE_CESIUM_GLOBE` in its runtime environment.

## Solution
Adjusted Docker Compose frontend environment syntax for `VITE_CESIUM_GLOBE` to force consistent interpolation/injection.

## Changes
- Updated [docker-compose.yml](docker-compose.yml):
  - Changed frontend env entry from:
    - `- VITE_CESIUM_GLOBE=${VITE_CESIUM_GLOBE:-true}`
  - To:
    - `- "VITE_CESIUM_GLOBE=${VITE_CESIUM_GLOBE:-true}"`
- Rebuilt/recreated frontend service:
  - `docker compose up -d --build sovereign-frontend`

## Verification
- Resolved compose config now includes frontend key:
  - `VITE_CESIUM_GLOBE: "true"`
- Live container env now includes:
  - `VITE_CESIUM_GLOBE=true`

## Benefits
- Ensures Cesium toggle in root `.env` reaches frontend runtime reliably.
- Aligns Vite/app gating behavior with expected testing workflow.
