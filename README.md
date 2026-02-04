# Sovereign Watch: Distributed Multi-INT Fusion Center

> **Operational Status**: Phase 1 (Infrastructure & Foundation) - _Active Development_

Sovereign Watch is a self-hosted, distributed intelligence fusion platform designed to ingest, normalize, and analyze high-velocity telemetry (ADS-B, AIS, Orbital) and high-variety intelligence (SIGINT, OSINT). It enforces data sovereignty by running entirely on local hardware (Edge to Cloud), utilizing a "Pulse" architecture for data collection and a "Tiered AI" strategy for cognition.

---

![Sovereign Watch](assets/images/SovereignWatch.png)

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

## 🗼 Tactical Indicators

### Asset Symbology

- **Chevrons**: Indicate directional heading and asset type.
- **Pulsating Rings**: Indicate active telemetry updates; intensity increases when an asset is selected.

### Altitude Color Coding (Aviation)

The Tactical Map uses a "thermal" gradient to indicate flight altitude at a glance:

- 🔵 **Blue**: Grounded / Taxiing (< 200ft)
- 🟡 **Yellow**: Departure / Approach (< 5,000ft)
- 🟠 **Orange**: Mid-Altitude Climb/Descent (< 25,000ft)
- 🔴 **Red**: High-Altitude Cruise (> 25,000ft)

### Environmental Interaction

- **2D Mode**: Standard top-down tactical view for area overview.
- **3D Mode**: $45^{\circ}$ perspective view for spatial awareness and altitude visualization.
- **Trails**: 3D history lines showing the recent flight path of selected assets.

## 📂 Directory Structure

| Path                 | Purpose                                                | Git Status  |
| :------------------- | :----------------------------------------------------- | :---------- |
| `/.agent`            | Agent memory, skills, and global project rules.        | **Tracked** |
| `/backend/ingestion` | Redpanda Connect (Benthos) pipeline configs (`.yaml`). | **Tracked** |
| `/backend/db`        | Database schema (`init.sql`) and migration scripts.    | **Tracked** |
| `/backend/api`       | Python FastAPI service for Fusion and Analysis.        | **Tracked** |
| `/frontend`          | React + Vite application (Tactical Map).               | **Tracked** |
| `/docs`              | Architecture plans, research, and progress logs.       | **Tracked** |

## 🤖 AI Agent Protocol

This repository is **Agent-Aware**. If you are an AI assistant contributing to this project:

1.  **Read Rules**: You **MUST** read `.agent/GEMINI.md` at the start of your session.
2.  **Environment Protocol**: Never run commands (npm, pip, python) directly on the host. Always use the **Docker Compose** commands defined in the rules.
3.  **Communication**: All inter-service data must adhere to the **TAK Protocol (Protobuf)** as defined in `tak.proto`.
4.  **Aesthetics**: Follow the "Sovereign Glass" design principles for all UI modifications.

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
