# CLAUDE.md - Claude Code Specific Overrides

> Extends AGENTS.md. Read AGENTS.md first. Rules here take precedence for Claude Code sessions.

## Verification Override (Host Tools Allowed)

Containers may not be running during Claude sessions. Run lint and unit tests on the host directly — do NOT spin up docker compose just to verify.

**IMPORTANT:** Always follow the **Targeted Verification** rule (Section 5 of `AGENTS.md`): Only run the suites for the components/languages you have actually modified.

```bash
cd frontend && pnpm run lint && pnpm run test
cd backend/api && uv tool run ruff check . && uv run python -m pytest
cd backend/ingestion/<poller> && uv tool run ruff check . && uv run python -m pytest
cd js8call && uv tool run ruff check . && uv run python -m pytest
```

If containers ARE already running, prefer:

```bash
docker compose exec sovereign-frontend pnpm run lint
docker compose exec sovereign-backend uv tool run ruff check .
docker compose exec sovereign-adsb-poller uv tool run ruff check .
docker compose exec sovereign-ais-poller uv tool run ruff check .
docker compose exec sovereign-space-pulse uv tool run ruff check .
docker compose exec sovereign-rf-pulse uv tool run ruff check .
docker compose exec sovereign-infra-poller uv tool run ruff check .
docker compose exec sovereign-js8call uv tool run ruff check .
```

**Container-first still applies for:** building images, running the application, and
ingestion poller changes (always require rebuild + restart).

## Documentation & Change Tracking (REQUIRED)

> **This is the most commonly missed rule.** After completing any significant feature, bug fix, or architectural change you **MUST** create a task log file, no exceptions.

- **Path**: `agent_docs/tasks/YYYY-MM-DD-{task-slug}.md`
- **When**: After every completed task that touches source code — not just "significant" ones. If in doubt, create the log.
- **Required sections**: Issue · Solution · Changes (files + logic) · Verification · Benefits

```
# Example: agent_docs/tasks/2026-04-07-fix-websocket-reconnect.md
## Issue
## Solution
## Changes
## Verification
## Benefits
```

See Section 4 of `AGENTS.md` for the full spec.

## Map Layer Work

Z-ordering rules are injected automatically when you edit files in
`frontend/src/layers/` or `frontend/src/components/map/`. No manual read needed.

## Git Workflow

- Branch prefix MUST be: `claude/<session-id>`
- Always push with: `git push -u origin <branch-name>`
- Retry up to 4x on network failures with exponential backoff (2s, 4s, 8s, 16s)
- Never push to `main` or another user's branch without explicit permission
