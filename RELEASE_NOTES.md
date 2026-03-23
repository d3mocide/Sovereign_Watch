# Release - v0.46.1 - Bug Squash Hardening

## High-Level Summary

This patch release is a large-scale stabilization pass focused on reliability and developer velocity. The frontend now enforces TypeScript compiler checks in the standard workflow, and a broad set of map/layer/infrastructure type contract issues were resolved. The result is a significantly cleaner Problems panel, safer runtime event handling, and fewer regressions slipping through lint-only validation.

## Key Features

- **Typecheck Workflow Added**: Frontend now includes `pnpm run typecheck` and `pnpm run verify` to gate both lint and compiler checks.
- **Massive Bug Squash**: Type and contract fixes across tactical/orbital map rendering, tooltip data shaping, replay utilities, and JS8 websocket payload parsing.
- **Deck.gl Typing Alignment**: Path/polygon accessors and pick-info adapters updated to match strict Deck v9 typings.
- **Map Callback Hardening**: Unknown event payloads are safely narrowed before property access in map movement/load flows.

## Technical Details

- **Frontend Script Changes**:
   - Added `typecheck`: `tsc --noEmit`
   - Added `verify`: `pnpm run lint && pnpm run typecheck`
- **Compiler Diagnostics**: Resolved the previously uncaught TypeScript backlog in frontend hooks, map components, and layer builders.
- **Version Metadata**: Frontend package bumped to `0.46.1`.

## Upgrade Instructions

1. **Pull the latest changes**:
   ```bash
   git pull origin main --tags
   ```
2. **Rebuild frontend/backend containers**:
   ```bash
   docker compose up -d --build sovereign-frontend sovereign-backend
   ```
3. **Run verification**:
   ```bash
   cd frontend
   pnpm run verify
   pnpm run test -- --run
   ```
