# PLAN-sovereign-watch-implementation.md

## 1. Overview

Implementation plan for **Sovereign Watch**, a distributed Multi-INT fusion center. The system transitions from a passive consumption model to an "Active Collection Model," ingesting unfiltered telemetry (ADS-B, AIS), normalizing it to Cursor on Target (CoT), and applying Hybrid AI for analysis. The architecture is "unbundled" and containerized, designed for edge deployment (Jetson/Pi) with cloud augmentations.

## 2. Project Type

**Type**: FULL_STACK (Infrastructure + Backend + Frontend)
**Primary Agents**: `devops-engineer`, `backend-specialist`, `database-architect`, `frontend-specialist`

## 3. Success Criteria

1.  **Infrastructure**: Stable Docker Compose environment with isolated networks (frontend/backend/ai).
2.  **Data Persistence**: High-throughput storage of telemetry in TimescaleDB (Hypertables) and vector embeddings.
3.  **Ingestion**: Real-time pipelines for Aviation (Airplanes.live) and Maritime (AISStream) running via Redpanda Connect.
4.  **Intelligence**: Functioning AI Gateway (LiteLLM) with PII redaction and tiered routing (Edge vs Cloud).
5.  **Visualization**: High-performance "Tactical Map" (Deck.gl) rendering 10k+ entities at 60fps.
6.  **Fusion**: Operational `/analyze` endpoint correlating hard telemetry with soft intelligence reports.

## 4. Tech Stack

| Component     | Technology        | Rationale                                                                           |
| ------------- | ----------------- | ----------------------------------------------------------------------------------- |
| **Event Bus** | Redpanda          | C++ architecture, low latency, low memory footprint for edge.                       |
| **Database**  | TimescaleDB       | PostgreSQL extension for time-series; PostGIS for geospatial; pgvectorscale for AI. |
| **Ingestion** | Redpanda Connect  | Stateless, declarative (Bloblang) stream processing.                                |
| **Backend**   | Python (FastAPI)  | AI ecosystem native, async support.                                                 |
| **AI**        | LiteLLM, Llama 3  | Unified proxy for Edge (Jetson) and Cloud (Gemini/Claude) models.                   |
| **Frontend**  | React 18, Deck.gl | WebGL-powered visualization for high-cardinality datasets.                          |
| **UI**        | TailwindCSS       | "Tactical Sci-Fi" design system.                                                    |

## 5. File Structure

```
/
├── .env.example            # Environment variables template
├── docker-compose.yml      # Master infrastructure definition
├── infra/                  # Infrastructure configurations
├── backend/
│   ├── ingestion/          # Redpanda Connect (Benthos) yamls
│   ├── api/                # FastAPI Application
│   └── ai/                 # LiteLLM & Presidio config
├── frontend/               # React Application
│   ├── src/
│   │   ├── components/
│   │   │   └── TacticalMap.tsx
│   │   └── styles/
│   └── tailwind.config.js
└── docs/                   # Documentation and Plans
```

## 6. Task Breakdown

### Phase 1: Infrastructure & Foundation (P0)

#### [Task 1.1] Docker Infrastructure Setup (Infra-01)

- **Agent**: `devops-engineer`
- **Skill**: `server-management`
- **Input**: `roadmap.md` (Section 2.3)
- **Instructions**:
  - Create `docker-compose.yml`.
  - Define 3 networks: `frontend-net`, `backend-net`, `ai-net`.
  - **Services**:
    - `redpanda` (Optimized: `--smp 1 --memory 1G`).
    - `timescaledb` (Image: `timescale/timescaledb-ha:pg16`).
    - `redis` (Persistence enabled).
- **Output**: `docker-compose.yml`, `.env.example`
- **Verify**: `docker compose config` passes. Networks are isolated effectively.

### Phase 2: Database Layer (P0)

#### [Task 2.1] Database Schema Bootstrap (DB-01)

- **Agent**: `database-architect`
- **Skill**: `database-design`
- **Input**: `roadmap.md` (Section 4.4)
- **Instructions**:
  - Create `backend/db/init.sql`.
  - Enable extensions: `timescaledb`, `postgis`, `vectorscale`.
  - **Table `tracks`**: `time`, `entity_id`, `type`, `geom`, `meta`. Create Hypertable (1-day chunk).
  - **Compression**: Segment by `entity_id`, order by `time DESC`.
  - **Table `intel_reports`**: `embedding` (VECTOR 384), `geom`. Index with DiskANN.
- **Output**: `backend/db/init.sql`
- **Verify**: Run SQL script against TimescaleDB container successfully. Tables and Hypertables exist.

### Phase 3: Ingestion Layer (P1)

#### [Task 3.1] Aviation Pipeline Config (Ingest-01)

- **Agent**: `backend-specialist`
- **Skill**: `api-patterns`
- **Input**: `roadmap.md` (Section 3.5)
- **Instructions**:
  - Create `backend/ingestion/aviation_ingest.yaml` (Redpanda Connect/Benthos).
  - **Input**: HTTP Polling `https://api.airplanes.live/v2/point/...`
  - **Process**: Bloblang mapping. Normalize to Cursor on Target (CoT). Decode `dbFlags` (Bit 0=Mil, Bit 3=LADD).
  - **Output**: Topic `adsb_raw`.
- **Output**: `backend/ingestion/aviation_ingest.yaml`
- **Verify**: Run Benthos lint/check. Pipeline successfully maps sample JSON to CoT XML/JSON.

#### [Task 3.2] Maritime Pipeline Config (Ingest-02)

- **Agent**: `backend-specialist`
- **Skill**: `api-patterns`
- **Input**: `roadmap.md` (Section 3.5)
- **Instructions**:
  - Create `backend/ingestion/maritime_ingest.yaml`.
  - **Input**: WebSocket `wss://stream.aisstream.io/v0/stream`.
  - **Process**: Map MMSI to CoT `uid`. Map Type to `a-f-S-C-M`.
  - **Output**: Topic `ais_raw`.
- **Output**: `backend/ingestion/maritime_ingest.yaml`
- **Verify**: Run Benthos lint/check.

### Phase 4: Cognitive (AI) Layer (P1)

#### [Task 4.1] AI Gateway Configuration (AI-01)

- **Agent**: `backend-specialist`
- **Skill**: `mcp-builder` (or general backend)
- **Input**: `roadmap.md` (Section 5.3)
- **Instructions**:
  - Create `backend/ai/litellm_config.yaml`.
  - Define Tiers: `secure-core` (Local/Ollama), `public-flash` (Gemini), `deep-reasoner` (Claude).
  - Configure routing fallbacks and operational logic.
  - Define "Fail Closed" logic for secure tier.
- **Output**: `backend/ai/litellm_config.yaml`
- **Verify**: LiteLLM starts with config. PII redaction layer is defined (conceptually or as middleware code).

### Phase 5: Presentation Layer (P2)

#### [Task 5.1] Design System & Shell (FE-02)

- **Agent**: `frontend-specialist`
- **Skill**: `frontend-design`, `tailwind-patterns`
- **Input**: `roadmap.md` (Section 6.3)
- **Instructions**:
  - Initialize React App (Vite).
  - Configure `tailwind.config.js` with "Tactical Sci-Fi" palette (`#050505`, `#00ff41`, `#ff3333`).
  - Font: JetBrains Mono.
- **Output**: `frontend/tailwind.config.js`, Basic App Shell.
- **Verify**: App builds. Colors match spec.

#### [Task 5.2] WebGL Tactical Map (FE-01)

- **Agent**: `frontend-specialist`
- **Skill**: `frontend-design`
- **Input**: `roadmap.md` (Section 6.3)
- **Instructions**:
  - Create `TacticalMap.tsx`.
  - Implement Deck.gl `IconLayer` and `PathLayer`.
  - Use `useRef` for tracking state (Performance critical).
  - Implement `useAnimationLoop`.
- **Output**: `frontend/src/components/TacticalMap.tsx`
- **Verify**: Component renders map. Mock data points (10k) render at 60fps.

### Phase 6: Fusion & Integration (P2)

#### [Task 6.1] Analysis Fusion API (Backend-01)

- **Agent**: `backend-specialist`
- **Skill**: `python-patterns`, `api-patterns`
- **Input**: `roadmap.md` (Section 7.2)
- **Instructions**:
  - Create FastAPI app in `backend/api/`.
  - Implement `POST /api/analyze/{uid}`.
  - Logic: Query TimescaleDB (History) + Vector Search (Reports) -> Prompt Deep Reasoner (Claude).
- **Output**: `backend/api/main.py`
- **Verify**: Endpoint accepts UID, returns SSE stream from LLM.

## 7. Phase X: Verification Checklist

- [ ] **Linting**: All configs (YAML, JSON, Python, TS) pass linting.
- [ ] **Security**: No hardcoded API keys in files (use env vars). PII redaction active.
- [ ] **Performance**: Deck.gl renders 10,000 entities > 30fps.
- [ ] **[AI-02] Local Inference Engine**
  - **Agent**: `devops-specialist`
  - **Skill**: `server-management`
  - **Input**: `docker-compose.yml`
  - **Instructions**:
    - Add `ollama` service (or `nano-llm` for Jetson).
    - Configure volume for model storage.
    - Pull `llama3` model on startup.
  - **Output**: Functional local LLM at `http://ollama:11434`.
  - **Verification**: `curl http://localhost:11434/api/generate` works.

- [ ] **[Ingest-03] Audio Intelligence (SIGINT)**
  - **Agent**: `devops-specialist`
  - **Skill**: `docker-management`
  - **Input**: `docker-compose.yml`
  - **Instructions**:
    - Add `whisper` service (rhasspy/wyoming-whisper).
    - Map audio ingest folder.
  - **Output**: Running Whisper service.
  - **Verification**: Transcribes sample .wav file.

- [ ] **[FE-03] Containerization**: Ingestion pipelines correctly normalize to CoT.
- [ ] **Build**: `docker compose up` brings all services to Healthy state.
- [ ] **Manual Audit**: Run `python .agent/scripts/checklist.py .`

## 8. Master Agent Task List (Summary)

| ID         | Task          | Agent                 |
| ---------- | ------------- | --------------------- |
| Infra-01   | Docker Env    | `devops-engineer`     |
| DB-01      | Schema        | `database-architect`  |
| Ingest-01  | Aviation Data | `backend-specialist`  |
| Ingest-02  | Maritime Data | `backend-specialist`  |
| AI-01      | AI Gateway    | `backend-specialist`  |
| FE-01      | WebGL Map     | `frontend-specialist` |
| FE-02      | UI Design     | `frontend-specialist` |
| Backend-01 | Fusion API    | `backend-specialist`  |
