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
- **js8call**: Python-based HF radio terminal.
  - **Source**: `js8call/`
  
- **Infrastructure**: Docker Compose, localized dev environment.

### Docker Compose Mappings

| Service Container | Source Path | Context / Responsibility |
| :--- | :--- | :--- |
| `sovereign-frontend` | `frontend/` | React (Vite) HUD interface |
| `sovereign-backend` | `backend/api/` | FastAPI REST/WS/SSE API |
| `sovereign-ais-poller` | `backend/ingestion/maritime_poller/` | AIS Ingestion (AISStream) |
| `sovereign-adsb-poller` | `backend/ingestion/aviation_poller/` | ADS-B Ingestion (ADSBx) |
| `sovereign-space-pulse` | `backend/ingestion/space_pulse/` | Orbital, SatNOGS, Weather |
| `sovereign-rf-pulse` | `backend/ingestion/rf_pulse/` | Repeaters, NOAA NWR |
| `sovereign-infra-poller` | `backend/ingestion/infra_poller/` | Cables, Outages, FCC Towers |
| `sovereign-gdelt-pulse` | `backend/ingestion/gdelt_pulse/` | OSINT Events (GDELT) |
| `sovereign-js8call` | `js8call/` | HF Radio Terminal + Bridge |
| `sovereign-timescaledb` | `backend/db/` | Historical Data Store |
| `sovereign-redis` | N/A | Real-time Cache / State |
| `sovereign-redpanda` | N/A | Event Stream (Kafka) |
| `sovereign-nginx` | `nginx/` | Reverse Proxy / Ingress |

## 2. Mandatory Architectural Invariants

- **Execution Standard (Agent/Developer):**
  - **Host-First for code checks**: Run linting, unit tests, and static analysis on the host by default for speed and tool availability.
  - **Docker-First for runtime/parity**: Use Docker Compose for image builds, service startup/runtime validation, and integration checks that depend on compose networking.
  - **Ingestion runtime rule**: Poller code/config changes still require container rebuild + restart (`docker compose up -d --build <service>`).
- **Communication**: All inter-service communication must use **TAK Protocol V1 (Protobuf)** via `tak.proto`. No ad-hoc JSON.
- **Rendering**: Hybrid Architecture (WebGL2 for visuals, WebGPU/Workers for compute). Do not downgrade to Leaflet.
  - **Map Layer Reference**: `agent_docs/z-ordering.md` documents the full draw-order stack, `depthTest`/`depthBias` rules, and animation loop data threading. It is injected automatically when you edit files in `frontend/src/layers/` or `frontend/src/components/map/`.
- **State**: Backend uses `Redpanda` (Kafka-compatible) for event streaming.
- **Ingestion**: Use Python pollers (`backend/ingestion/`). Do NOT use Redpanda Connect (Benthos).
- **AI Reasoning**: All AI-driven analysis, SITREPs, and regional evaluations **MUST** use the unified `AIService` in `backend/api/services/ai_service.py`. This ensures consistent model configuration, persona management, and behavioral signal integration across the platform.

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

## 5. Verification & Quality Gates

Before declaring a task complete, you **MUST** run the appropriate verification **once** using standard tools for the repository. Do NOT run lint/tests after each individual file edit — run them once at the end before marking the task done.

### Targeted Verification (Efficiency Rule)

To avoid excessive runtime, **only** run verification suites for the components/languages you have actually modified in the current task.

| Component / Language | Verification Command(s) |
| :--- | :--- |
| **Frontend** (`.ts`, `.tsx`, `.css`) | `cd frontend && pnpm run lint && pnpm run test` |
| **Backend API** (`api/*.py`) | `cd backend/api && uv tool run ruff check . && uv run python -m pytest` |
| **Ingestion Pollers** (`ingestion/*.py`) | `cd backend/ingestion/<poller> && uv tool run ruff check . && uv run python -m pytest` |
| **Radio Service** (`js8call/*.py`) | `cd js8call && uv tool run ruff check . && uv run python -m pytest` |
| **Documentation Only** (`.md`) | Skip code suites; ensure MD rules/consistency pass. |

### Verification Decision Gate (Efficiency + Parity)

Use this gate to avoid unnecessary container overhead while preserving runtime parity:

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
   1. If host toolchain is available, run verification on host first.
   2. If host toolchain is missing or results are environment-sensitive, run inside Docker.
   3. Before merge/release, ensure parity-critical checks have been run in Docker.

## 6. Directory Structure Map

```text
.
├── .agent/           # Focused AI Skills (e.g., specific rules for React, FastAPI, Geo)
├── frontend/         # React Application (Vite)
│   ├── src/          # Source Code
│   └── package.json  # Frontend Dependencies
├── backend/          # Microservices Root
│   ├── api/          # FastAPI Server (pyproject.toml + uv.lock)
│   ├── ingestion/    # Data Ingestion Services (Python Pollers)
│   │   ├── aviation_poller/   # ADS-B, OpenSky
│   │   ├── maritime_poller/   # AIS (AISStream)
│   │   ├── space_pulse/   # Orbital, SatNOGS, Weather
│   │   ├── rf_pulse/      # Repeaters, NOAA NWR
│   │   └── infra_poller/  # Cables, Outages, FCC Towers
│   ├── ai/           # LLM Config (litellm_config.yaml)
│   ├── database/     # Database Policies (Retention)
│   ├── db/           # Database Initialization (init.sql)
│   └── scripts/      # Utility Scripts
├── js8call/          # HF Radio Terminal + Bridge
├── nginx/            # Reverse Proxy Config
├── agent_docs/       # Agent Documentation
│   ├── tasks/        # Task-specific change logs (YYYY-MM-DD-slug.md)
│   └── z-ordering.md # Deck.gl layer draw order, depthTest rules & data threading guide (READ BEFORE TOUCHING MAP LAYERS)
├── tools/            # Utility scripts (z-ordering, etc.)
├── Documentation/    # Project Wiki
├── docker-compose.yml
└── AGENTS.md         # This file
```
