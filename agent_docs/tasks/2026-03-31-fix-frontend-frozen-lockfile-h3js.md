# 2026-03-31-fix-frontend-frozen-lockfile-h3js

## Issue
The frontend Docker build failed at `pnpm install --frozen-lockfile` because `frontend/package.json` included `h3-js` but the importer section of `frontend/pnpm-lock.yaml` did not include that dependency.

## Solution
Regenerated the frontend lockfile using `pnpm install` in `frontend/` so the lockfile importer state matches `package.json`.

## Changes
- `frontend/pnpm-lock.yaml`: Updated lock metadata/importer dependencies to include top-level `h3-js`.
- `agent_docs/tasks/2026-03-31-fix-frontend-frozen-lockfile-h3js.md`: Added task record.

## Verification
- Ran `cd frontend; pnpm install` successfully.
- Confirmed `h3-js` now appears in importer dependencies of `frontend/pnpm-lock.yaml`.

## Benefits
Restores deterministic frontend container builds with `--frozen-lockfile` and prevents dependency drift between manifest and lockfile.
