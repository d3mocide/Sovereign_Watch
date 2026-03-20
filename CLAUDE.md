# CLAUDE.md - Claude Code Specific Overrides

> Extends AGENTS.md. Read AGENTS.md first. Rules here take precedence for Claude Code sessions.

## Verification Override (Host Tools Allowed)

Containers may not be running during Claude sessions. Use host tools directly for
lint and unit tests — do NOT spin up docker compose just to verify:

### Verification Decision Gate (Use This Order)

1. **Host-first for inner-loop checks:**
    - Lint, unit tests, static analysis.
    - Default to host for speed and lower iteration cost.

2. **Docker-required for parity-critical validation:**
    - Build images, start services, integration/runtime checks, and any environment-sensitive behavior.

3. **Poller runtime rule remains strict:**
    - Ingestion poller code/config updates must be rebuilt/restarted in Docker for real validation.

4. **Release confidence:**
    - Before merge/release, run parity-critical checks in Docker even if host checks already passed.

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
run through whichever `bash` is first on PATH:

```
bash (PATH) ──▶ run-*.sh wrappers ──▶ ./tools/bin/mcp-language-server + LSP stdio
```

**Windows** — keep `.mcp.json` portable by ensuring `bash` resolves correctly:
- If you want WSL bash, install a distro (`wsl --install -d Ubuntu`).
- If you want Git Bash, place `C:\Program Files\Git\bin` before `C:\Users\<you>\AppData\Local\Microsoft\WindowsApps` in PATH.
- Verify with `Get-Command bash -All` (PowerShell) and ensure your preferred `bash.exe` appears first.

**Linux / macOS** — keep `bash` available on PATH (default on most systems).

One-time local setup required on all hosts:

```bash
# Requires git + go 1.24+
./tools/mcp-language-server/build.sh

# Host LSP servers (if not already installed)
npm install -g typescript typescript-language-server
npm install -g pyright
```

Do not `npm install -g mcp-language-server` — that resolves to an unrelated package.

Quick local readiness check:

```bash
./tools/mcp-language-server/check.sh
```

This prints PASS/FAIL and exact commands to fix missing prerequisites.

For token-efficient MCP usage after startup, read `agent_docs/mcp-agent-playbook.md`. Default order is: symbol tools first, file-level codemap/dependency tools second, graph impact tools third, broad grep/search last. After import/export edits, invalidate or rebuild graph data before trusting dependency results.

### Why This Matters Here

- FastAPI routers import from `services/`, `models/`, and `core/` — `goToDefinition` resolves these in ~50ms vs scanning 40+ Python files
- The frontend has 30+ Deck.gl layer components — `findReferences` for a layer type is instant and exact
- On Jetson Nano (4GB RAM), avoiding full-repo grep scans directly reduces peak memory pressure during sessions

## Git Workflow

- Branch prefix MUST be: `claude/<session-id>`
- Always push with: `git push -u origin <branch-name>`
- Retry up to 4x on network failures with exponential backoff (2s, 4s, 8s, 16s)
- Never push to `main` or another user's branch without explicit permission
