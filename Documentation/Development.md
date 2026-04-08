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
| **pnpm** | 9+ | All frontend dependencies use pnpm. npm is used only for global LSP servers |
| **Python** | 3.12+ | Required for backend lint, tests, and LSP on the host |
| **uv** | latest | Python package manager used by backend services (`pyproject.toml` + `uv.lock`) |
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
| Lint · tests · LSP servers | Local recommended | Fastest feedback loop; container execution remains available when needed |

---

## Clone & Environment Setup

```bash
git clone https://github.com/d3mocide/Sovereign_Watch.git
cd Sovereign_Watch
cp .env.example .env
```

Edit `.env` with your credentials. At minimum you need an AISStream API key for maritime data and at least one AI API key for the analyst. See [Configuration Reference](./Configuration.md) for the full variable list.

If you also want maritime source failover, set `AISHUB_USERNAME`. Leave it blank to keep the original AISStream-only behavior. `AIS_PRIMARY_SOURCE` lets you choose whether `aisstream` or `aishub` is tried first.

---

## Local Dependencies (Recommended)

Installing frontend and backend dependencies locally gives your editor full type resolution without requiring a running container. This is the difference between Pylance knowing that `db.pool` is an `asyncpg.Pool` vs. showing it as `Unknown`.

**Frontend — install `node_modules` locally:**

```bash
cd frontend && pnpm install
```

Your editor can now resolve all Deck.gl, MapLibre, React, and Tailwind types from `frontend/node_modules/`. Vite HMR and `pnpm run lint` / `pnpm run test` also work directly from here.

**Backend API — create a local virtual environment:**

```bash
cd backend/api
uv sync --group dev
source .venv/bin/activate        # Windows: .venv\Scripts\activate
```

Point your editor's Python interpreter at `backend/api/.venv`. Pylance and pyright then resolve FastAPI, asyncpg, pydantic, LiteLLM, and every other dependency from the venv rather than guessing.

> The infrastructure services — TimescaleDB, Redpanda, Redis — still run in Docker. The API and frontend can start without them locally for lint and type-checking, but the app requires `docker compose up -d` to function end-to-end.

---

---

## Editor Setup

### VS Code · Cursor · Windsurf · Antigravity

All four are VS Code-family editors and read `.vscode/settings.json` automatically. The file is already committed — no manual configuration required.

**What's pre-configured:**

- Python: Pylance (Pyright engine), Ruff formatter, import organisation on save
- TypeScript / TSX: tsserver, Prettier formatter
- Extra Python paths for all six ingestion pollers

**Recommended extensions:**

| Extension | ID | Purpose |
| :--- | :--- | :--- |
| Python | `ms-python.python` | Python language support |
| Pylance | `ms-python.vscode-pylance` | Fast Pyright-powered IntelliSense |
| Ruff | `charliermarsh.ruff` | Python linting and formatting |
| ESLint | `dbaeumer.vscode-eslint` | TypeScript/React linting |
| Prettier | `esbenp.prettier-vscode` | TypeScript/CSS/JSON formatting |
| Docker | `ms-azuretools.vscode-docker` | Compose file support + container logs |
| EditorConfig | `EditorConfig.EditorConfig` | Enforces `.editorconfig` rules |

**Cursor / Windsurf / Antigravity extras:**

- `.cursorrules` at the project root is auto-loaded as AI context for Cursor, Windsurf, and compatible Google-augmented VS Code forks (Antigravity). It contains the project overview, directory map, architectural rules, and key commands.

---

### JetBrains (PyCharm · WebStorm · IntelliJ IDEA)

**Python (PyCharm or IntelliJ with Python plugin):**

1. **Settings → Python Interpreter** → Add Interpreter → Docker Compose, select `backend-api` service — or point at a local `.venv` if you prefer running tools on the host.
2. Mark `backend/api` as a Sources Root for correct import resolution.
3. Enable Ruff integration (external tool or plugin) so lint/format behavior matches CI and VS Code.

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

---

### All Other LSP-Capable Editors

Any editor with LSP support will work out of the box:

| Config file | What it controls |
| :--- | :--- |
| `pyrightconfig.json` (project root) | Python LSP — covers `backend/api` and all six ingestion pollers |
| `frontend/tsconfig.json` | TypeScript LSP — strict mode, ES2020, React JSX |
| `.editorconfig` (project root) | Formatting baseline — indentation, line endings, charset |

Point your editor's Python LSP at `pyrightconfig.json` and its TypeScript LSP at `frontend/tsconfig.json` and you are good to go.

---

## AI Coding Tool Setup

---

### Cursor

No setup required. Two files are auto-loaded:

| File | Purpose |
| :--- | :--- |
| `.cursorrules` | Project overview, architecture rules, directory map, key commands |
| `.vscode/settings.json` | Pylance + tsserver LSP wiring |

---

---

### OpenAI Codex CLI

Codex CLI reads `AGENTS.md` at the project root (OpenAI convention). That file is already present and contains the full architectural rules, directory structure, and verification commands.

No additional configuration needed.

---
---

## Development Workflow

### Frontend (TypeScript · React · Vite)

With `node_modules` installed locally (see [Local Dependencies](#local-dependencies-recommended)), all of these run directly on the host. Vite HMR is active when you run the local dev server (`pnpm run dev`) or the frontend container.

```bash
cd frontend
pnpm run lint          # ESLint
pnpm run test          # Vitest unit tests
pnpm tsc --noEmit      # Type check without building
```

The frontend unit test suite now covers more than geometry helpers. Current high-value coverage includes alert engines, entity filtering, event categorisation, interpolation, and trail smoothing, so `pnpm run test` is useful for catching behavioral regressions rather than only utility breakage.

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

**Pylance / pyright resolution for pollers:** The root `pyrightconfig.json` covers `backend/ingestion/` and points to the root-level `.venv`. Poller dependencies are not installed there by default, so you'll see `Import "redis" could not be resolved`-style errors until you install them once:

```bash
# From the repo root — installs poller deps into the root .venv for IDE use only
# (Runtime still uses each poller's own Docker image)
uv venv
uv pip install --python .venv redis==7.3.0 psycopg2-binary requests aiohttp   # Windows
# or
uv venv
uv pip install --python .venv redis==7.3.0 psycopg2-binary requests aiohttp   # Linux / macOS
```

After installing, do **Ctrl+Shift+P → Python: Restart Language Server** in VS Code to clear cached errors.

**Pollers do not support hot reload.** Any change to `backend/ingestion/<poller>/` requires a rebuild and restart:

```bash
docker compose up -d --build sovereign-adsb-poller
docker compose up -d --build sovereign-ais-poller
docker compose up -d --build sovereign-space-pulse
docker compose up -d --build sovereign-infra-poller
docker compose up -d --build sovereign-rf-pulse
docker compose up -d --build sovereign-gdelt-pulse
```

```bash
# Lint and test on host (no rebuild needed for these)
cd backend/ingestion/aviation_poller && ruff check . && python -m pytest
cd backend/ingestion/maritime_poller && ruff check . && python -m pytest
cd backend/ingestion/space_pulse && ruff check . && python -m pytest
```

---

### CI Dry Run (Local)

To mirror GitHub Actions test jobs before pushing, use the helper script:

`tools/run-ci-checks.ps1`

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1
```

Useful options:

- `-Jobs <list>`: run specific jobs only (for example `frontend,backend-api`).
- `-ChangedFiles <list>`: auto-select jobs from changed paths using the same mapping as `.github/workflows/ci.yml`.
- `-InstallDeps`: install each job's CI dependencies before running tests.
- `-ContinueOnFailure`: keep running remaining jobs after a failure.
- `-VerbosePytest`: run pytest with extra verbosity.

Examples:

```powershell
# Selected jobs only
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1 -Jobs backend-api,rf-pulse

# Auto-select from changed files
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1 -ChangedFiles backend/api/main.py,js8call/server.py

# Run all jobs, install dependencies, continue after failures
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1 -Jobs all -InstallDeps -ContinueOnFailure
```

Exit code behavior:

- `0` when all selected jobs pass
- `1` when any selected job fails

---

## Further Reading

| Document | Description |
| :--- | :--- |
| [Deployment & Upgrade Guide](./Deployment.md) | Full install, docker compose, upgrade, troubleshooting |
| [Configuration Reference](./Configuration.md) | Every `.env` variable for every service |
| [API Reference](./API_Reference.md) | REST endpoints, WebSocket feed, SSE streaming |
| [TAK Protocol Reference](./TAK_Protocol.md) | Internal message schema (Protobuf / CoT) |
| [AGENTS.md](../AGENTS.md) | Architectural invariants and rules for all contributors |
| [z-ordering.md](../agent_docs/z-ordering.md) | **Mandatory reading before touching any map layer** |
