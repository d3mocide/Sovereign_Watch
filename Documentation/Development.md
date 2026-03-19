# Development Setup Guide

> **For human contributors.** This guide covers getting your local environment productive in under 30 minutes — editor config, LSP, AI coding tools, and the dev workflow.
>
> For running the full application, see [Deployment & Upgrade Guide](./Deployment.md).
> For AI agent / automated session rules, see [AGENTS.md](../AGENTS.md).

---

## Prerequisites

| Requirement | Version | Notes |
| :--- | :--- | :--- |
| **Node.js** | 20+ | Required for frontend tooling and LSP servers |
| **npm** or **pnpm** | npm 10+ / pnpm 9+ | Project uses both; npm recommended for global installs |
| **Python** | 3.11+ | Required for backend lint, tests, and LSP on the host |
| **Docker** | 24+ | Required for infrastructure services (DB, bus, cache) |
| **Docker Compose** | v2 | Included with Docker Desktop |

**What runs where:**

| Layer | Where | Why |
| :--- | :--- | :--- |
| TimescaleDB + PostGIS + pgvector | Always Docker | Three Postgres extensions with native system deps — impractical to install bare |
| Redpanda (Kafka) | Always Docker | Complex native install; no benefit to running it outside a container |
| Redis · nginx | Always Docker | Trivial to containerise; compose networking keeps them wired correctly |
| Ingestion pollers | Always Docker | Depend on Redpanda being reachable on the compose network |
| Frontend (Vite/React) | **Local recommended** | `node_modules` on the host gives editors full type resolution for Deck.gl, MapLibre, etc. HMR also tends to be more reliable without a bind-mount layer |
| Backend API (FastAPI) | **Local recommended** | A local `.venv` gives Pylance/pyright access to FastAPI, asyncpg, pydantic types without Docker exec |
| Lint · tests · LSP servers | Always local | Host tools only — no containers involved |

---

## Clone & Environment Setup

```bash
git clone https://github.com/d3mocide/Sovereign_Watch.git
cd Sovereign_Watch
cp .env.example .env
```

Edit `.env` with your credentials. At minimum you need an AISStream API key for maritime data and at least one AI API key for the analyst. See [Configuration Reference](./Configuration.md) for the full variable list.

---

## Local Dependencies (Recommended)

Installing frontend and backend dependencies locally gives your editor full type resolution without requiring a running container. This is the difference between Pylance knowing that `db.pool` is an `asyncpg.Pool` vs. showing it as `Unknown`.

**Frontend — install `node_modules` locally:**

```bash
cd frontend && npm install
```

Your editor can now resolve all Deck.gl, MapLibre, React, and Tailwind types from `frontend/node_modules/`. Vite HMR and `npm run lint` / `npm run test` also work directly from here.

**Backend API — create a local virtual environment:**

```bash
cd backend/api
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Point your editor's Python interpreter at `backend/api/.venv`. Pylance and pyright then resolve FastAPI, asyncpg, pydantic, LiteLLM, and every other dependency from the venv rather than guessing.

> The infrastructure services — TimescaleDB, Redpanda, Redis — still run in Docker. The API and frontend can start without them locally for lint and type-checking, but the app requires `docker compose up -d` to function end-to-end.

---

## LSP Server Installation (One-Time)

Language Server Protocol gives your editor (and AI coding tools) **semantic understanding** of the codebase — exact symbol definitions, all call sites, accurate type information — instead of text-search guesses. On memory-constrained hardware like the Jetson Nano (4 GB RAM), it also eliminates expensive full-repo grep scans.

**`mcp-language-server` is a Go binary, not an npm package.** It is vendored in `tools/bin/` and must be built from pinned source. Do not run `npm install -g mcp-language-server` — that package name resolves to something unrelated on the npm registry.

**Step 1 — build the MCP bridge binary (requires `git` and `go 1.24+`):**

```bash
./tools/mcp-language-server/build.sh
```

This clones the upstream repo at the pinned tag, verifies the commit hash, builds a static binary, and writes it to `tools/bin/mcp-language-server`. The pinned version, expected commit, and sha256 are in `tools/mcp-language-server/VERSION`. If you cannot install Go, see the Docker alternative in `tools/mcp-language-server/Dockerfile`.

**Step 2 — install the TypeScript and Python LSP servers globally:**

```bash
# TypeScript / JavaScript LSP
npm install -g typescript typescript-language-server

# Python LSP — matches pyrightconfig.json at the project root
npm install -g pyright
```

These three pieces only need to be installed once per machine. `.mcp.json` points at `./tools/bin/mcp-language-server` and is already committed — no further config is needed.

---

## Editor Setup

### VS Code · Cursor · Windsurf · Antigravity

All four are VS Code-family editors and read `.vscode/settings.json` automatically. The file is already committed — no manual configuration required.

**What's pre-configured:**
- Python: Pylance (Pyright engine), Black formatter, import organisation on save
- TypeScript / TSX: tsserver, Prettier formatter
- Extra Python paths for all five ingestion pollers

**Recommended extensions:**

| Extension | ID | Purpose |
| :--- | :--- | :--- |
| Python | `ms-python.python` | Python language support |
| Pylance | `ms-python.vscode-pylance` | Fast Pyright-powered IntelliSense |
| ESLint | `dbaeumer.vscode-eslint` | TypeScript/React linting |
| Prettier | `esbenp.prettier-vscode` | TypeScript/CSS/JSON formatting |
| Docker | `ms-azuretools.vscode-docker` | Compose file support + container logs |
| EditorConfig | `EditorConfig.EditorConfig` | Enforces `.editorconfig` rules |

**Cursor / Windsurf / Antigravity extras:**

- `.cursorrules` at the project root is auto-loaded as AI context for Cursor, Windsurf, and compatible Google-augmented VS Code forks (Antigravity). It contains the project overview, directory map, architectural rules, and key commands.
- Antigravity users: the `mcp-language-server` in `.mcp.json` also works with Gemini CLI's MCP support — see the [Gemini CLI](#gemini-cli) section below.

---

### JetBrains (PyCharm · WebStorm · IntelliJ IDEA)

**Python (PyCharm or IntelliJ with Python plugin):**
1. **Settings → Python Interpreter** → Add Interpreter → Docker Compose, select `backend-api` service — or point at a local `.venv` if you prefer running tools on the host.
2. Install the **Pylance** plugin (JetBrains Marketplace) — it reads `pyrightconfig.json` at the project root automatically.
3. Mark `backend/api` as a Sources Root for correct import resolution.

**TypeScript (WebStorm or IntelliJ):**
1. TypeScript support is bundled — no plugin needed.
2. **Settings → Languages & Frameworks → TypeScript** → enable *TypeScript Language Service*, point workspace root to `frontend/`.
3. `frontend/tsconfig.json` is picked up automatically.

---

### Neovim / Vim

Requires [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig). Add to your config:

```lua
local lspconfig = require('lspconfig')

-- Python — reads pyrightconfig.json at project root automatically
lspconfig.pyright.setup({
  root_dir = lspconfig.util.root_pattern('pyrightconfig.json', '.git'),
})

-- TypeScript / TSX — reads frontend/tsconfig.json
lspconfig.ts_ls.setup({
  root_dir = lspconfig.util.root_pattern('tsconfig.json', '.git'),
  init_options = {
    preferences = { importModuleSpecifierPreference = 'relative' },
  },
})
```

> The `.mcp.json` MCP server is specific to Claude Code and does not apply to Neovim.

---

### All Other LSP-Capable Editors

Any editor with LSP support will work out of the box:

| Config file | What it controls |
| :--- | :--- |
| `pyrightconfig.json` (project root) | Python LSP — covers `backend/api` and all five ingestion pollers |
| `frontend/tsconfig.json` | TypeScript LSP — strict mode, ES2020, React JSX |
| `.editorconfig` (project root) | Formatting baseline — indentation, line endings, charset |

Point your editor's Python LSP at `pyrightconfig.json` and its TypeScript LSP at `frontend/tsconfig.json` and you are good to go.

---

## AI Coding Tool Setup

### Claude Code

No setup required. Two files are auto-loaded at session start:

| File | Purpose |
| :--- | :--- |
| `CLAUDE.md` | Session rules, verification commands, git workflow |
| `.mcp.json` | Auto-registers `mcp-language-server` — enables `goToDefinition`, `findReferences`, `hover`, `rename` as Claude tools |

See [CLAUDE.md](../CLAUDE.md) for session-specific instructions and the LSP tool preference table.

---

### Cursor

No setup required. Two files are auto-loaded:

| File | Purpose |
| :--- | :--- |
| `.cursorrules` | Project overview, architecture rules, directory map, key commands |
| `.vscode/settings.json` | Pylance + tsserver LSP wiring |

---

### Gemini CLI

Gemini CLI reads `GEMINI.md` at the project root when present. That file does not yet exist in this project — the interim approach is to wire MCP manually.

Add to `~/.gemini/settings.json` on your host:

```json
{
  "mcpServers": {
    "lsp": {
      "command": "mcp-language-server",
      "args": ["--workspace", "/path/to/Sovereign_Watch"]
    }
  }
}
```

This gives Gemini CLI the same `goToDefinition` / `findReferences` capabilities that Claude Code gets via `.mcp.json`. Replace `/path/to/Sovereign_Watch` with your actual clone path.

---

### OpenAI Codex CLI

Codex CLI reads `AGENTS.md` at the project root (OpenAI convention). That file is already present and contains the full architectural rules, directory structure, and verification commands.

No additional configuration needed.

---

### Other MCP-Compatible Tools

Any tool that supports the Model Context Protocol can use the project's LSP server. Point it at `.mcp.json` or replicate its contents:

```json
{
  "mcpServers": {
    "lsp": {
      "command": "mcp-language-server",
      "args": ["--workspace", "/path/to/Sovereign_Watch"]
    }
  }
}
```

---

## Development Workflow

### Frontend (TypeScript · React · Vite)

With `node_modules` installed locally (see [Local Dependencies](#local-dependencies-recommended)), all of these run directly on the host. Vite HMR is active whenever the frontend container is running — saves reflect in the browser instantly.

```bash
cd frontend

npm run lint          # ESLint
npm run test          # Vitest unit tests
npx tsc --noEmit      # Type check without building
```

---

### Backend API (Python · FastAPI)

With a local `.venv` active (see [Local Dependencies](#local-dependencies-recommended)), lint and tests run directly on the host. Uvicorn runs with `--reload` inside the container — saves to `backend/api/` restart the server automatically.

```bash
cd backend/api
source .venv/bin/activate    # if not already active

ruff check .                 # lint
python -m pytest             # unit tests
```

If you prefer to run inside the container:

```bash
docker compose exec sovereign-backend ruff check .
docker compose exec sovereign-backend python -m pytest
```

---

### Ingestion Pollers

**Pollers do not support hot reload.** Any change to `backend/ingestion/<poller>/` requires a rebuild and restart:

```bash
docker compose up -d --build sovereign-adsb-poller
docker compose up -d --build sovereign-ais-poller
docker compose up -d --build sovereign-orbital-pulse
docker compose up -d --build sovereign-infra-poller
docker compose up -d --build sovereign-rf-pulse
```

```bash
# Lint and test on host (no rebuild needed for these)
cd backend/ingestion/aviation_poller && ruff check . && python -m pytest
cd backend/ingestion/maritime_poller && ruff check . && python -m pytest
```

---

## Further Reading

| Document | Description |
| :--- | :--- |
| [Deployment & Upgrade Guide](./Deployment.md) | Full install, docker compose, upgrade, troubleshooting |
| [Configuration Reference](./Configuration.md) | Every `.env` variable for every service |
| [API Reference](./API_Reference.md) | REST endpoints, WebSocket feed, SSE streaming |
| [TAK Protocol Reference](./TAK_Protocol.md) | Internal message schema (Protobuf / CoT) |
| [AGENTS.md](../AGENTS.md) | Architectural invariants and rules for all contributors |
| [CLAUDE.md](../CLAUDE.md) | Claude Code-specific overrides and LSP tool usage |
| [z-ordering.md](../agent_docs/z-ordering.md) | **Mandatory reading before touching any map layer** |
