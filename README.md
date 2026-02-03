# Sovereign Watch: Distributed Multi-INT Fusion Center

> **Operational Status**: Phase 1 (Infrastructure & Foundation) - _Active Development_

Sovereign Watch is a self-hosted, distributed intelligence fusion platform designed to ingest, normalize, and analyze high-velocity telemetry (ADS-B, AIS, Orbital) and high-variety intelligence (SIGINT, OSINT). It enforces data sovereignty by running entirely on local hardware (Edge to Cloud), utilizing a "Pulse" architecture for data collection and a "Tiered AI" strategy for cognition.

---

## 🛠️ Quick Start

### Prerequisites

- Docker & Docker Compose
- NVIDIA Container Toolkit (if using Local AI/Jetson)

### Installation

1.  **Clone & Configure**:

    ```bash
    cp .env.example .env
    # Edit .env with your keys (Airplanes.live, Mapbox, etc.)
    ```

2.  **Boot System**:

    ```bash
    docker compose up -d
    ```

3.  **Access Interfaces**:
    - **Tactical Map (UI)**: [http://localhost:3000](http://localhost:3000)
    - **Fusion API**: [http://localhost:8000/docs](http://localhost:8000/docs)
    - **Redpanda Console**: [http://localhost:8080](http://localhost:8080)
    - **Portainer**: [http://localhost:9000](http://localhost:9000)

## 📂 Architecture Overview

```mermaid
graph TD
    subgraph "Ingestion (Redpanda Connect)"
        A[ADS-B / AIS] -->|Protobuf| B(Redpanda Bus)
        C[Space-Track Pulse] -->|Protobuf| B
    end

    subgraph "Persistence (TimescaleDB)"
        B -->|Stream| D[(Tracks Hypertable)]
        B -->|Stream| E[(Vector Store)]
    end

    subgraph "Cognition (LiteLLM)"
        F[Fusion API] -->|Query| G{AI Router}
        G -->|Tier 1| H[Local Llama3]
        G -->|Tier 3| I[Claude 3.5]
    end

    subgraph "Presentation (React + Deck.gl)"
        J[MainHud Shell] --> K[TopBar Tactical Clock]
        J --> L[Pure Chevron Markers]
        L --> M[Transient Update Loop]
        M -->|WebGL| N[Mapbox Overlay]
    end
```

## 🛡️ Tactical Design ("Sovereign Glass")

- **Chevron-First Architecture**: Unified directional trackers for all assets; no legacy dot markers.
- **High-Fidelity HUD**: Integrated global TopBar with synchronized temporal reference (UTC) and live state metadata.
- **Immersion Layers**: Micro-noise texture and tactical grid overlays for a professional surveillance aesthetic.
- **Interactive Vectors**: Pickable chevrons for target locking, historic trail inspection, and telemetry drill-down.

## 📂 Directory Structure

| Path                 | Purpose                                                | Git Status  |
| :------------------- | :----------------------------------------------------- | :---------- |
| `/backend/ingestion` | Redpanda Connect (Benthos) pipeline configs (`.yaml`). | **Tracked** |
| `/backend/db`        | Database schema (`init.sql`) and migration scripts.    | **Tracked** |
| `/backend/api`       | Python FastAPI service for Fusion and Analysis.        | **Tracked** |
| `/frontend`          | React + Vite application (Tactical Map).               | **Tracked** |

## 🧪 Development Workflow

To add a new dependency (e.g., to Frontend):

1.  **Edit** `frontend/package.json`.
2.  **Rebuild**:
    ```bash
    docker compose up -d --build frontend
    ```

To update the Database Schema:

1.  **Edit** `backend/db/init.sql`.
2.  **Reset** (Warning: Destructive):
    ```bash
    docker compose down -v
    docker compose up -d db
    ```

---

_Maintained by d3FRAG Networks & The Antigravity Agent Team._
