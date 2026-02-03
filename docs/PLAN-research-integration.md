# PLAN-research-integration.md

## 1. Overview & Research Synthesis

This plan integrates critical findings from the **Technical Feasibility Study**, **API Research**, and **SIGINT/GEODeC Data Strategy**. It serves as the definitive architecture guide for the "Strategic Pivot" required to upgrade Sovereign Watch to a Distributed Multi-INT Fusion Center.

### Key Research Findings

1.  **Rendering (The "Sandwich" Solution)**:
    - **Constraint**: WebGPU cannot interleave with Mapbox GL JS depth buffers (Z-fighting).
    - **Solution**: **Hybrid Architecture**. WebGL2 for the visual layer (enabling `interleaved: true` for occlusion) + Headless WebGPU for physics ("Swarm") compute.
2.  **Data Transport (The 83% Reduction)**:
    - **Constraint**: JSON/XML parsing on the main thread is a bottleneck for >10k entities.
    - **Solution**: **TAK Protocol V1 (Protobuf)**. Prepend Magic Bytes (`0xbf 0x01 0xbf`) to allow zero-copy ingestion by `protobuf.js` in Web Workers.
3.  **SIGINT & Spectrum Analysis**:
    - **Jamming Detection**: Infer GPS jamming from ADS-B "Integrity" fields (NIC/NACp) using **H3 Spatial Aggregation**. Crowdsourced EW (Electronic Warfare) detection.
    - **Spectrum Verification**: Use **SatNOGS** data (`status=good`) to verify satellite audibility against orbital predictions.
    - **Static Baselines**: Ingest FCC/ITU Frequency Tables as **SQLite/WASM** artifacts for offline lookup.

---

## 2. Updated Architecture Matrix

| Domain               | Source              | Strategy                             | Output Format          |
| :------------------- | :------------------ | :----------------------------------- | :--------------------- |
| **Aviation**         | **Airplanes.live**  | Unfiltered Stream (1Hz)              | TAK Protobuf (`a-f-A`) |
| **Maritime**         | **aisstream.io**    | WebSocket Stream                     | TAK Protobuf (`a-f-S`) |
| **Orbital**          | **Space-Track.org** | **Pulse** (Cron 6h) + Auth Session   | TAK Protobuf (`a-s-K`) |
| **Env/Space Wx**     | **NOAA SWPC**       | **Pulse** (Cron 1h)                  | TAK Protobuf (`b-e-w`) |
| **SIGINT (Jamming)** | **ADS-B Exchange**  | **Analytics** (NIC/NACp Aggregation) | TAK Protobuf (`y-g-i`) |
| **Spectrum**         | **SatNOGS**         | **Pulse** (Cron 1h)                  | TAK Protobuf (`r-s-g`) |
| **Static Data**      | **FCC/ITU**         | **Artifact** (SQLite DB)             | Client-side SQL.js     |
| **Rendering**        | **Hybrid WebGL2**   | Interleaved Depth Occlusion          | Deck.gl Layers         |
| **Compute**          | **Headless WebGPU** | Boids/Swarm Physics                  | SharedArrayBuffer      |

---

## 3. Implementation Task Breakdown

### Phase 1: High-Performance Core (Hybrid Engine)

#### [Task 1.1] TacticalMap Hybrid Implementation (FE-01)

- **Goal**: Render entities _behind_ buildings using WebGL2.
- **Agent**: `frontend-specialist`
- **Skill**: `frontend-design`
- **Instructions**:
  - Refactor `TacticalMap.tsx` to use `MapboxOverlay` with `interleaved: true`.
  - **Constraint**: Force Deck.gl to use `webgl` backend (not WebGPU) for visual layers.
  - Implement **Transient Update Loop** (`requestAnimationFrame`) bypassing React reconciliation.
  - Use `Float32Array` for zero-copy data transfer.

#### [Task 1.2] "Invisible" WebGPU Compute Worker (FE-04)

- **Goal**: Simulate 100k particles (Agent Swarm) without freezing UI.
- **Agent**: `frontend-specialist`
- **Algorithm**: Boids (Separation, Alignment, Cohesion).
- **Instructions**:
  - Create `src/workers/physics.worker.ts`.
  - Initialize `GPUDevice` (Headless).
  - Write `boids.wgsl` Compute Shader.
  - Transfer positions to Main Thread via `postMessage(buffer, [buffer])`.

#### [Task 1.3] TAK Decoder Worker (FE-05)

- **Goal**: Decode binary TAK messages off-main-thread.
- **Agent**: `frontend-specialist`
- **Instructions**:
  - Implement `protobufjs` loader with TAK `.proto` schema (lightweight).
  - **Logic**: Verify Magic Bytes -> Decode -> Update `Float32Array` buffers -> Transfer to Render Loop.

### Phase 2: Fundamental Ingestion (Protobuf Transition)

#### [Task 2.1] Aviation Pipeline (Ingest-01)

- **Source**: Airplanes.live (HTTP Polling).
- **Logic**:
  - Map `hex` -> `uid`.
  - Decode `dbFlags` (Bit 0 = Military).
  - **Encode**: TAK Protobuf with Magic Header (`0xbf 0x01 0xbf`).
- **Output**: Topic `adsb_tak`.

#### [Task 2.2] Maritime Pipeline (Ingest-02)

- **Source**: aisstream.io (WebSocket).
- **Logic**:
  - Auth Handshake `{"APIKey": "..."}`.
  - Map `MMSI` -> `uid`.
  - **Encode**: TAK Protobuf.
- **Output**: Topic `ais_tak`.

### Phase 3: Advanced Intelligence (Pulse & Analytics)

#### [Task 3.1] Orbital & Weather "Pulse" Pipeline (Ingest-03)

- **Source**: Space-Track (SDA) + NOAA (Space Wx).
- **Agent**: `backend-specialist`
- **Input**: `backend/ingestion/orbital_pulse.yaml`
- **Logic**:
  - **Pulse Architecture**: Cron Trigger (`0 */6 * * *` for SDA, `0 * * * *` for NOAA).
  - **SDA**: POST Login -> Capture Cookie -> GET GP History.
  - **NOAA**: GET `planetary_k_index_1m.json`. Extract latest.
  - **Encode**: TAK Protobuf (`a-s-K` for Sats, `b-e-w` for Wx).

#### [Task 3.2] SIGINT Jamming Analysis Pipeline (Ingest-04)

- **Source**: ADSBExchange (Rapid Update API).
- **Agent**: `backend-specialist`
- **Logic**:
  - **Filter**: `NIC < 7` OR `NACp < 7` (Low Integrity).
  - **Aggregation**: Group by **H3 Index** (Res 4).
  - **Calc**: `JammingIndex = (Bad_Count / Total_Count)`.
  - **Encode**: TAK Protobuf (Type: `y-g-i` / Interference).
- **Output**: Topic `sigint_jamming`.

#### [Task 3.3] Spectrum Verification Pipeline (Ingest-05)

- **Source**: SatNOGS DB API.
- **Logic**:
  - Filter: `status=good`.
  - Map: `norad_cat_id` -> `uid`.
  - **Encode**: TAK Protobuf.
- **Output**: Topic `spectrum_obs`.

#### [Task 3.4] Static Frequency Artifacts (Data-01)

- **Source**: FCC/ITU Tables (CSV/JSON).
- **Agent**: `database-architect`
- **Instructions**:
  - Create build script to transform CSV -> `frequencies.sqlite`.
  - Frontend: Use `sql.js-httpvfs` or similar to query DB from client WASM.

---

## 4. Master Agent Task List

| ID            | Task                       | Component | Priority | Status      |
| :------------ | :------------------------- | :-------- | :------- | :---------- |
| **FE-01**     | **Hybrid Interleaved Map** | Frontend  | **P0**   | **Pending** |
| **FE-04**     | **WebGPU Physics Worker**  | Frontend  | P1       | **Pending** |
| **FE-05**     | **TAK Decoder Worker**     | Frontend  | **P0**   | **Pending** |
| **Ingest-01** | **Aviation (Protobuf)**    | Backend   | **P0**   | **Pending** |
| **Ingest-02** | **Maritime (Protobuf)**    | Backend   | P1       | **Pending** |
| **Ingest-03** | **Orbital (Pulse)**        | Backend   | P2       | **Pending** |
| **Ingest-04** | **SIGINT (Jamming)**       | Backend   | P2       | **Pending** |
| **Ingest-05** | **Spectrum (SatNOGS)**     | Backend   | P3       | **Pending** |
| **Data-01**   | **Static Frequency DB**    | Data      | P3       | **Pending** |
