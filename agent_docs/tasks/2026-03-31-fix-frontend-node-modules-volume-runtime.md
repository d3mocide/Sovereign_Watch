# 2026-03-31-fix-frontend-node-modules-volume-runtime

## Issue
After container startup, frontend failed with:
`Error: Cannot find module '/app/node_modules/vite/bin/vite.js'`.

The `sovereign-frontend` service bind-mounts `./frontend:/app`, which overrides image filesystem contents at `/app`. Without a dedicated `/app/node_modules` volume, installed dependencies from image build are hidden at runtime.

## Solution
Restored a named Docker volume for frontend dependencies and mounted it at `/app/node_modules`.

## Changes
- `docker-compose.yml`
  - Added top-level volume: `sovereign-vol-frontend-node-modules`.
  - Added service mount for `sovereign-frontend`: `sovereign-vol-frontend-node-modules:/app/node_modules`.

## Verification
- `docker compose config -q` passed.
- `docker compose up -d --force-recreate sovereign-frontend` created the volume and started the container.
- `docker compose logs sovereign-frontend --tail 80` shows successful startup:
  - `VITE v7.3.1 ready`
  - Local URL exposed without module errors.

## Benefits
Restores stable frontend container runtime by preventing bind mounts from masking installed dependencies.
