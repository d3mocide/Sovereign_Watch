# AGENTS.md - AI Developer Guide

> **CRITICAL:** This file is the authoritative source for AI agents working on this project. Read this first.

## 1. Project Context
**Sovereign Watch** is a distributed intelligence fusion platform.
- **Frontend**: React (Vite), Tailwind CSS.
  - **Mapping**: Hybrid Architecture supporting **Mapbox GL JS** OR **MapLibre GL JS** (dynamic import based on env), overlaid with **Deck.gl** v9.
  - Source: `frontend/src/components/map/TacticalMap.tsx`
- **Backend**: FastAPI (Python)
  - **Ingestion**: Python-based pollers in `backend/ingestion/` (Aviation, Maritime, Satellite)
  - **Streaming**: Redpanda (Kafka-compatible) for event bus.
- **Infrastructure**: Docker Compose, localized dev environment.

## 2. Mandatory Rules (from `.agent/rules/GEMINI.md`)

### 🏗️ Architectural Invariants
- **Communication**: All inter-service communication use **TAK Protocol V1 (Protobuf)**. No ad-hoc JSON.
- **Rendering**: Hybrid Architecture (WebGL2 for visuals). Do not downgrade to Leaflet.
- **State**: Backend uses `Redpanda` (Kafka-compatible) for event streaming.
- **Ingestion**: Use Python pollers (`backend/ingestion/`). Do NOT use Redpanda Connect (Benthos).

### 📝 Documentation & Change Tracking
- **Requirement**: You **MUST** create a new file in `docs/tasks/` for all significant features, bug fixes, and architectural changes.
- **Format**: Filename: `YYYY-MM-DD-{task-slug}.md`
- **Content**:
  - **Issue**: Description of the problem or feature request.
  - **Solution**: High-level approach taken.
  - **Changes**: Specific files modified and logic implemented.
  - **Verification**: Tests run and results observed.
  - **Benefits**: Impact on the project (e.g., performance, security, maintainability).

## 3. Verification & Quality Gates
Before declaring a task complete, you **MUST** run the appropriate verification using standard tools for the repository.

### ⚡ Quick Checks
Run standard commands based on the part of the project you are editing:

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

## 4. Directory Structure Map
```
.
├── .agent/           # Antigravity Framework (DO NOT READ RECURSIVELY)
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
├── docs/             # Documentation
│   └── tasks/        # Task-specific change logs (YYYY-MM-DD-slug.md)
├── docker-compose.yml
└── AGENTS.md         # This file
```

## 5. Common Issues & Fixes
- **Testing Failures**: Ensure that you have the required dependencies installed (e.g. `npm install` for frontend, `pip install -r requirements.txt` for backend) when running tests directly.
