# CLAUDE.md - Claude Code Specific Overrides

> Extends AGENTS.md. Read AGENTS.md first. Rules here take precedence for Claude Code sessions.

## Verification Override (Host Tools Allowed)

Containers may not be running during Claude sessions. Use host tools directly for
lint and unit tests — do NOT spin up docker compose just to verify:

```bash
# Frontend
cd frontend && npm run lint && npm run test

# Backend API
cd backend/api && ruff check . && python -m pytest

# Pollers
cd backend/ingestion/<poller> && ruff check . && python -m pytest
```

If containers ARE already running, prefer:

```bash
docker compose exec frontend npm run lint
docker compose exec backend-api ruff check .
```

## Container-First Still Applies For

- Building images: `docker compose build <service>`
- Running the application: `docker compose up -d`
- Ingestion poller changes (always require rebuild + restart)

## Git Workflow

- Branch prefix MUST be: `claude/<session-id>`
- Always push with: `git push -u origin <branch-name>`
- Retry up to 4x on network failures with exponential backoff (2s, 4s, 8s, 16s)
- Never push to `main` or another user's branch without explicit permission
