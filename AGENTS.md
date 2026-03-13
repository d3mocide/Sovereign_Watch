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

## 5. Verification & Quality Gates

Before declaring a task complete, you **MUST** run the appropriate verification using standard tools for the repository.

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
│   └── tasks/        # Task-specific change logs (YYYY-MM-DD-slug.md)
├── Documentation/    # Project Wiki
├── docker-compose.yml
└── AGENTS.md         # This file
```
