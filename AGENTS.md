# AGENTS.md - Developer & AI Guide

> **CRITICAL:** This file is the authoritative source for AI agents and developers working on Sovereign Watch. It contains all architectural rules, verification commands, and documentation requirements.

## 1. Project Context

**Sovereign Watch** is a distributed intelligence fusion platform.

- **Frontend**: React (Vite), Tailwind CSS.
  - **Mapping**: Hybrid Architecture supporting **Mapbox GL JS** OR **MapLibre GL JS** (dynamic import based on env), overlaid with **Deck.gl** v9.
  - **Source**: `frontend/src/components/map/TacticalMap.tsx`
- **Backend**: FastAPI (Python).
  - **Ingestion**: Python-based pollers in `backend/ingestion/` (Aviation, Maritime, Satellite).
  - **Streaming**: Redpanda (Kafka-compatible) for the event bus.
- **Infrastructure**: Docker Compose, localized dev environment.

## 2. Mandatory Architectural Invariants

- **Container-First**: Do NOT run `npm`, `node`, `python`, `pip`, or `go` directly on the host shell for build/runtime tasks. Use Docker Compose (`docker compose build <service>`, `docker compose up -d --build <service>`).
- **Communication**: All inter-service communication must use **TAK Protocol V1 (Protobuf)** via `tak.proto`. No ad-hoc JSON.
- **Rendering**: Hybrid Architecture (WebGL2 for visuals, WebGPU/Workers for compute). Do not downgrade to Leaflet.
  - **Map Layer Reference**: Before adding or modifying any Deck.gl layer, you **MUST** read `agent_docs/z-ordering.md`. It documents the full draw-order stack, `depthTest`/`depthBias` rules, and — critically — the **animation loop data threading checklist** that every new layer's data ref must complete to be visible on the map.
- **State**: Backend uses `Redpanda` (Kafka-compatible) for event streaming.
- **Ingestion**: Use Python pollers (`backend/ingestion/`). Do NOT use Redpanda Connect (Benthos).

## 3. Development Workflow (Live Code Updates)

Both frontend and backend have Hot Module Replacement (HMR) enabled:

| Service       | Trigger                      | HMR Method                                                     | Notes                                          |
| ------------- | ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| **Frontend**  | Save any `.tsx`/`.ts`/`.css` | Vite HMR (polling, 1s interval)                                | No restart needed. Changes reflect instantly.  |
| **Backend**   | Save any `.py`               | Uvicorn `--reload` (StatReload)                                | No restart needed. Server auto-restarts.       |
| **Ingestion** | Modify Code/Config           | **REQUIRES REBUILD:** `docker compose up -d --build <service>` | Python Pollers need container rebuild/restart. |

## 4. Documentation & Change Tracking

- **Requirement**: You **MUST** create a new file in `agent_docs/tasks/` for all significant features, bug fixes, and architectural changes.
- **Format**: Filename: `YYYY-MM-DD-{task-slug}.md`
- **Content**:
  - **Issue**: Description of the problem or feature request.
  - **Solution**: High-level approach taken.
  - **Changes**: Specific files modified and logic implemented.
  - **Verification**: Tests run and results observed.
  - **Benefits**: Impact on the project (e.g., performance, security, maintainability).
- **MCP Workflow Reference**: For token-efficient MCP and LSP tool selection, read `agent_docs/mcp-agent-playbook.md` before falling back to broad repo search.

## 5. Verification & Quality Gates

Before declaring a task complete, you **MUST** run the appropriate verification **once** using standard tools for the repository. Do NOT run lint/tests after each individual file edit — run them once at the end before marking the task done.

### Verification Decision Gate (Efficiency + Parity)

Use this gate to avoid unnecessary container overhead while preserving container-first architecture:

1. **Inner-loop code checks (preferred on host):**
  - Linting
  - Unit tests
  - Static analysis
  - Use host tools first for fastest feedback when equivalent tooling is available.

2. **Parity-critical checks (must use Docker):**
  - Image builds
  - Service startup/runtime validation
  - Integration checks that depend on container networking/service wiring
  - Any task where host environment differences could hide defects

3. **Ingestion poller rule (always containerized for runtime):**
  - Poller code/config changes still require rebuild and restart via Docker Compose.

4. **Practical fallback order:**
  - If host toolchain is available, run verification on host first.
  - If host toolchain is missing or results are environment-sensitive, run inside Docker.
  - Before merge/release, ensure parity-critical checks have been run in Docker.

### Quick Checks

```bash
# Frontend
cd frontend
npm run lint
npm run test

# Backend API
cd backend/api
ruff check .
python -m pytest

# Poller Services
cd backend/ingestion/aviation_poller # (or other poller)
ruff check .
python -m pytest
```

## 6. Directory Structure Map

```
.
├── .agent/           # Focused AI Skills (e.g., specific rules for React, FastAPI, Geo)
├── frontend/         # React Application (Vite)
│   ├── src/          # Source Code
│   └── package.json  # Frontend Dependencies
├── backend/          # Microservices Root
│   ├── api/          # FastAPI Server (has requirements.txt)
│   ├── ingestion/    # Data Ingestion Services (Python Pollers)
│   │   ├── aviation_poller/
│   │   ├── maritime_poller/
│   │   └── orbital_pulse/
│   ├── ai/           # LLM Config (litellm_config.yaml)
│   ├── database/     # Database Policies (Retention)
│   ├── db/           # Database Initialization (init.sql)
│   └── scripts/      # Utility Scripts
├── agent_docs/       # Agent Documentation
│   ├── tasks/        # Task-specific change logs (YYYY-MM-DD-slug.md)
│   └── z-ordering.md # Deck.gl layer draw order, depthTest rules & data threading guide (READ BEFORE TOUCHING MAP LAYERS)
├── Documentation/    # Project Wiki
├── docker-compose.yml
└── AGENTS.md         # This file
```
