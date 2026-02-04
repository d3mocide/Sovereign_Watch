# Sovereign Watch Task Progress

## Phase 1: Infrastructure & Foundation (P0)

- [x] **[Infra-01] Docker Infrastructure Setup**
  - [x] Create `docker-compose.yml`
  - [x] Define isolated networks (`frontend-net`, `backend-net`, `ai-net`)
  - [x] Services: Redpanda, TimescaleDB, Redis

## Phase 2: Database Layer (P0)

- [x] **[DB-01] Database Schema Bootstrap**
  - [x] Create `backend/db/init.sql`
  - [x] Hypertables setup (`tracks`)
  - [x] Vector schema setup (`intel_reports`)
  - [x] Compression Policy

## Phase 3: Ingestion Layer (P1)

- [x] **[Ingest-01] Aviation Pipeline Config**
  - [x] Create `backend/ingestion/aviation_ingest.yaml`
  - [x] Airplanes.live mapping logic
  - [x] TAK Protobuf output to `adsb_raw` topic
  - [x] 150nm coverage radius around Portland
- [x] **[Ingest-02] Maritime Pipeline Config**
  - [x] Create `backend/ingestion/maritime_ingest.yaml`
  - [x] AISStream WebSocket with API key authentication
  - [x] TAK Protobuf output to `ais_raw` topic
  - [x] Bounding box coverage (Eugene to Seattle)

## Phase 4: Cognitive (AI) Layer (P1)

- [x] **[AI-01] AI Gateway Configuration**
  - [x] Create `backend/ai/litellm_config.yaml`
  - [x] Define Tiering (Secure/Public/Deep)

## Phase 5: Presentation Layer (P2)

- [x] **[FE-02] Design System & Shell (Overhauled)**
  - [x] Setup React+Vite Scaffold
  - [x] Tailwind "Tactical" Config (Node-01 Theme)
  - [x] `MainHud.tsx`: Tactical shell with CRT/Grid effects.
  - [x] `SidebarLeft.tsx`: Consolidated filters, feed, and status.
  - [x] `SidebarRight.tsx`: Grouped details with integrated Compass.
  - [x] `index.html` with JetBrains Mono
- [x] **[FE-01] WebGL Tactical Map (Hybrid Engine Refactor)**
  - [x] `TacticalMap.tsx`: Switch to `MapboxOverlay` with `interleaved: true`.
  - [x] **Chevron-First Architecture**: Unified kite-style directional chevrons as primary markers.
  - [x] **Tactical Refinement**: HUD-locked scaling and centered icon anchoring.
  - [x] **High-Fidelity HUD (FE-02)**:
    - [x] Multi-component layout with `MainHud`, `TopBar`, and Sidebars.
    - [x] Integrated Tactical Clock (UTC) and live telemetry metadata pillars.
    - [x] Reactive Alert system with pulse-red overrides.
    - [x] Immersion Layers: Subtle noise grain and glass-grid overlays (scanlines removed per design review).
  - [x] Coverage boundary visualization and track trails restored.
  - [ ] **Pending**: Implement Binary Attribute Transfer (Float32Array).
- [x] **[FE-03] Containerization**
  - [x] Create `frontend/Dockerfile`
  - [x] Update `docker-compose.yml`
  - [x] Enable Vite HMR for live development
- [x] **[FE-06] Track Summary Panel**
  - [x] Real-time AIR/SEA counts from TacticalMap
  - [x] Color-coded indicators

## Phase 6: Fusion & Integration (P2)

- [x] **[Backend-01] Analysis Fusion API**
  - [x] FastAPI skeleton `main.py`
  - [x] SSE Integration setup
  - [x] Containerization (`backend/api/Dockerfile`)
- [x] **[Backend-02] Track Feed API**
  - [x] WebSocket `/api/tracks/live` endpoint
  - [x] Multi-topic Kafka consumer (`adsb_raw` + `ais_raw`)
  - [x] Protobuf serialization with magic bytes

## Phase 7: Research Integration (Research-01)

- [x] **[Research-01] Architecture Audit & Pivot**
  - [x] Analyze API Landscape (Aircraft/Marine).
  - [x] Analyze WebGPU vs WebGL Constraints.
  - [x] Create `docs/PLAN-research-integration.md`.
- [ ] **[Ingest-03] Orbital Pulse Pipeline** (Space-Track/SDA Cron Job).
- [ ] **[Ingest-04] SIGINT Jamming Pipeline** (ADS-B Integrity Analysis).
- [ ] **[Ingest-05] Spectrum Verification** (SatNOGS Integration).
- [ ] **[FE-04] Invisible WebGPU Worker** (Boids/Physics Compute).
- [x] **[FE-05] TAK Decoder Worker** (Client-side Protobuf & Integrated).
- [x] **[Ingest-01-Opt] Tier 1 Optimization** (Multi-Source + Staggered Polling).
- [ ] **[Ingest-06] Gap 3 Smart Poller** (Python + H3 Service).

## Pending Tasks (Next Priority)

- [x] **Entity Interaction**: Custom MapTooltip with glassmorphism and live indicators.
- [x] **Trail Lines**: Historical position tracks for selected entities (fixed color theme).
- [x] **Intelligence Feed Panel**: Integrated into SidebarLeft with custom event styling.
- [ ] **[Ingest-03] Orbital Pipeline**: Space-Track TLE integration.
- [x] **Details Sidebar**: Show extended info for selected entity.
- [x] **Filter Controls**: Toggle air/sea visibility, filter by type.
- [ ] **Search**: Find entity by callsign or UID.
