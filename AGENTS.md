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

### Running the stack

| Environment | Command |
| :--- | :--- |
| **Development** (hot-reload, Vite HMR) | `make dev` |
| **Production** (static build, no reload) | `make prod` |

`docker-compose.yml` is the complete, production-ready compose file.
`compose.dev.yml` is a small override file — it only redefines the three services that differ in dev (`sovereign-frontend`, `sovereign-backend`, `sovereign-nginx`). All other services are identical between environments.

The `Makefile` wraps the full compose commands so you never have to type them out. Run `make` with no arguments to see all available targets.

> **Rule for agents:** When adding or changing a service's environment variables, ports, or other config, update **`docker-compose.yml`** only. The dev override inherits everything from the base file.

### Docker Compose Mappings

| Service Container | Source Path | Context / Responsibility |
| :--- | :--- | :--- |
| `sovereign-frontend` | `frontend/` | **Prod:** nginx static bundle · **Dev:** Vite HMR server |
| `sovereign-backend` | `backend/api/` | FastAPI REST/WS/SSE API |
| `sovereign-ais-poller` | `backend/ingestion/maritime_poller/` | AIS Ingestion (AISStream) |
| `sovereign-adsb-poller` | `backend/ingestion/aviation_poller/` | ADS-B Ingestion (ADSBx) |
| `sovereign-space-pulse` | `backend/ingestion/space_pulse/` | Orbital, SatNOGS, Weather |
| `sovereign-rf-pulse` | `backend/ingestion/rf_pulse/` | Repeaters, NOAA NWR |
| `sovereign-infra-poller` | `backend/ingestion/infra_poller/` | Cables, Outages, FCC Towers |
| `sovereign-gdelt-pulse` | `backend/ingestion/gdelt_pulse/` | OSINT Events (GDELT) |
| `sovereign-js8call` | `js8call/` | HF Radio Terminal + Bridge |
| `sovereign-timescaledb` | `backend/db/initdb/` | Historical Data Store (schema bootstrapped from initdb/) |
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
| **Frontend**  | Save any `.tsx`/`.ts`/`.css` | Vite HMR (polling, 1s interval)                                | Dev only. Prod requires `docker compose build sovereign-frontend`. |
| **Backend**   | Save any `.py`               | Uvicorn `--reload` (StatReload)                                | Dev only. Prod runs without `--reload`.        |
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
| **Frontend** (`.ts`, `.tsx`, `.css`) | `cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test` |
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

## 6. Database Schema Workflow

> **CRITICAL RULE:** Never edit files in `backend/db/initdb/` to make schema changes on a running deployment. Those files only run on a completely empty Postgres volume (first install). Editing them has **zero effect** on any existing database.

### How the schema system works

| Path | Purpose | When it runs |
| :--- | :--- | :--- |
| `backend/db/initdb/01_extensions.sql` … `12_views.sql` | Bootstrap schema for fresh installs | Once, on empty volume only |
| `backend/db/migrations/V002__*.sql` … | Incremental schema changes | Every `docker compose up`, applied once per version |
| `backend/api/migrate.py` | Migration runner (part of backend startup) | Runs before uvicorn starts |

### Making a schema change (the only correct workflow)

1. Create a new file in `backend/db/migrations/` following the naming convention:
   ```
   V<NNN>__<short_description>.sql
   ```
   Start at **V002** — V001 is reserved for the initdb baseline.

2. Write idempotent SQL where possible (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`).

3. On next `docker compose up`, the backend logs will show `Applying V002__...` and record it in the `schema_migrations` table. Subsequent restarts skip it.

### Rules for agents

- **DO NOT** add tables, columns, indexes, functions, or views to `backend/db/initdb/` files after the project has been deployed.
- **DO NOT** create a new container or service to run migrations — the backend handles this at startup.
- **DO** create a migration file in `backend/db/migrations/` for every schema change.
- When adding a new domain/feature that requires multiple tables, a single migration file covering all related tables for that feature is fine.
- To check what migrations have been applied: `SELECT * FROM schema_migrations ORDER BY version;`

### initdb file map

The `backend/db/initdb/` files are the authoritative baseline schema, split by domain:

| File | Domain |
| :--- | :--- |
| `01_extensions.sql` | PostgreSQL extensions (timescaledb, postgis, vector, pg_trgm) |
| `02_telemetry.sql` | `tracks` hypertable (ADS-B / AIS / TAK live feed) |
| `03_satellites_satnogs.sql` | `satellites`, `satnogs_transmitters`, `satnogs_observations`, `satnogs_signal_events` |
| `04_rf_infrastructure.sql` | `rf_sites`, `rf_systems`, `rf_talkgroups`, `prune_stale_rf_sites()` |
| `05_intel.sql` | `intel_reports`, `get_contextual_intel()` vector search function |
| `06_critical_infrastructure.sql` | `infra_towers`, `internet_outages`, `peeringdb_ixps`, `peeringdb_facilities`, `iss_positions` |
| `07_space_weather.sql` | `space_weather_kp`, `jamming_events`, `space_weather_context` |
| `08_gdelt_osint.sql` | `gdelt_events`, `h3_risk_scores` |
| `09_ocean_ndbc.sql` | `ndbc_obs`, `ndbc_hourly_baseline` continuous aggregate |
| `10_users_auth.sql` | `users`, `update_users_updated_at()` trigger |
| `11_clausal_chains.sql` | `clausal_chains`, `hourly_clausal_summaries` continuous aggregate, triggers |
| `12_views.sql` | `clausal_chains_enriched` view |

## 7. Directory Structure Map

```text
.
├── .agent/           # Focused AI Skills (e.g., specific rules for React, FastAPI, Geo)
├── frontend/         # React Application (Vite)
│   ├── src/          # Source Code
│   └── package.json  # Frontend Dependencies
├── backend/          # Microservices Root
│   ├── api/          # FastAPI Server (pyproject.toml + uv.lock)
│   │   └── migrate.py    # DB migration runner (runs before uvicorn on startup)
│   ├── ingestion/    # Data Ingestion Services (Python Pollers)
│   │   ├── aviation_poller/   # ADS-B, OpenSky
│   │   ├── maritime_poller/   # AIS (AISStream)
│   │   ├── space_pulse/   # Orbital, SatNOGS, Weather
│   │   ├── rf_pulse/      # Repeaters, NOAA NWR
│   │   └── infra_poller/  # Cables, Outages, FCC Towers
│   ├── ai/           # LLM Config (litellm_config.yaml)
│   ├── database/     # Database Policies (Retention)
│   ├── db/
│   │   ├── initdb/       # Bootstrap SQL (fresh installs only — DO NOT EDIT for changes)
│   │   └── migrations/   # Incremental schema changes (V002__*.sql and beyond)
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
