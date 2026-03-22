# CLAUDE.md - Claude Code Specific Overrides

> Extends AGENTS.md. Read AGENTS.md first. Rules here take precedence for Claude Code sessions.

## Verification Override (Host Tools Allowed)

Containers may not be running during Claude sessions. Run lint and unit tests on the host directly — do NOT spin up docker compose just to verify.

**IMPORTANT:** Always follow the **Targeted Verification** rule (Section 5 of `AGENTS.md`): Only run the suites for the components/languages you have actually modified.

```bash
cd frontend && pnpm run lint && pnpm run test
cd backend/api && ruff check . && python -m pytest
cd backend/ingestion/<poller> && ruff check . && python -m pytest
cd js8call && ruff check . && python -m pytest
```

If containers ARE already running, prefer:

```bash
docker compose exec sovereign-frontend pnpm run lint
docker compose exec sovereign-backend ruff check
docker compose exec sovereign-adsb-poller ruff check
docker compose exec sovereign-ais-poller ruff check
docker compose exec sovereign-space-pulse ruff check
docker compose exec sovereign-rf-pulse ruff check
docker compose exec sovereign-infra-poller ruff check
docker compose exec sovereign-js8call ruff check
```

**Container-first still applies for:** building images, running the application, and
ingestion poller changes (always require rebuild + restart).

## Map Layer Work

Z-ordering rules are injected automatically when you edit files in
`frontend/src/layers/` or `frontend/src/components/map/`. No manual read needed.

## Git Workflow

- Branch prefix MUST be: `claude/<session-id>`
- Always push with: `git push -u origin <branch-name>`
- Retry up to 4x on network failures with exponential backoff (2s, 4s, 8s, 16s)
- Never push to `main` or another user's branch without explicit permission
