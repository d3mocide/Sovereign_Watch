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

## LSP Tools (Semantic Code Navigation)

This project is configured for LSP-powered navigation via `mcp-language-server`. When the MCP server is active, **prefer LSP tools over grep/find for all symbol resolution**:

| Task | Use Instead Of |
|------|---------------|
| Find a function/class definition | `goToDefinition` → not `grep -r "functionName"` |
| Find all callers of a function | `findReferences` → not `grep -r "functionName"` |
| Understand a symbol's type | `hover` → not reading the file manually |
| Rename a symbol project-wide | `rename` → not sed across files |

### How the MCP servers start

`.mcp.json` calls wrapper scripts (`tools/mcp-language-server/run-*.sh`) that
auto-select the right backend:

```
Docker daemon reachable?  ──yes──▶  docker compose run  (pinned LSP versions)
                          ──no───▶  ./tools/bin/mcp-language-server  (local binary)
```

**Windows + Docker Desktop** — Docker is reachable, wrappers use Docker.
No extra setup beyond having `bash` on PATH (Git Bash satisfies this).

**Linux / macOS without Docker** — wrappers fall back to the local binary.
One-time build required:

```bash
# Requires git + go 1.24+
./tools/mcp-language-server/build.sh

# Host LSP servers (if not already installed)
npm install -g typescript typescript-language-server
npm install -g pyright
```

Do not `npm install -g mcp-language-server` — that resolves to an unrelated package.

### Why This Matters Here

- FastAPI routers import from `services/`, `models/`, and `core/` — `goToDefinition` resolves these in ~50ms vs scanning 40+ Python files
- The frontend has 30+ Deck.gl layer components — `findReferences` for a layer type is instant and exact
- On Jetson Nano (4GB RAM), avoiding full-repo grep scans directly reduces peak memory pressure during sessions

## Git Workflow

- Branch prefix MUST be: `claude/<session-id>`
- Always push with: `git push -u origin <branch-name>`
- Retry up to 4x on network failures with exponential backoff (2s, 4s, 8s, 16s)
- Never push to `main` or another user's branch without explicit permission
