<div align="center">
  <img src="assets/images/logo.png" alt="Sovereign Watch Logo" width="260"/>
  
  # Sovereign Watch
  ### Distributed Multi-INT Fusion Center
  
  <p align="center">
    <a href="https://github.com/d3mocide/Sovereign_Watch/releases"><img src="https://img.shields.io/github/v/release/d3mocide/Sovereign_Watch?color=10B981&label=Release&style=for-the-badge" alt="Release"></a>
    <img src="https://img.shields.io/badge/Status-Phase%202%20(Active)-F97316?style=for-the-badge" alt="Status">
    <a href="https://github.com/d3mocide/Sovereign_Watch/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPLv3-06B6D4?style=for-the-badge" alt="License"></a>
    <img src="https://img.shields.io/badge/Docker-Ready-2563EB?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  </p>

  <p align="center">
    <em>A self-hosted, edge-to-cloud intelligence platform for high-velocity telemetry (ADS-B, AIS, Orbital) and OSINT fusion.</em><br/>
    <em>It enforces data sovereignty by running entirely on local hardware, utilizing a "Pulse" architecture and "Tiered AI" cognition.</em>
  </p>
</div>

---

## 🌍 System Overview

### Tactical Map View

![Sovereign Watch - Tactical Map](assets/images/SovereignWatch.png)

### Orbital Tracking

![Sovereign Watch - Orbital Map](assets/images/SovereignWatch-2.png)

---

## 🛠️ Quick Start

### Prerequisites

- Docker & Docker Compose
- NVIDIA Container Toolkit (if using Local AI/Jetson)

### Installation

1.  **Clone & Configure**:

    ```bash
    cp .env.example .env
    # Edit .env with your keys & config:
    # - CENTER_LAT / CENTER_LON (Your monitoring area)
    # - AISSTREAM_API_KEY (Maritime feed)
    # - ANTHROPIC_API_KEY / GEMINI_API_KEY (LLM Cognition)
    # - VITE_MAPBOX_TOKEN (3D Terrain & Maps)
    # - KIWI_HOST / KIWI_PORT (JS8Call SDR source)
    # - MY_GRID (Your Maidenhead locator)
    ```

2.  **Boot System**:

    ```bash
    docker compose up -d --build
    ```

3.  **Access Interfaces**:
    - **Tactical Map (UI)**: [http://localhost](http://localhost)
    - **Fusion API**: [http://localhost/api/docs](http://localhost/api/docs)

## ⚠️ Disclaimer & Liability

> [!IMPORTANT]
> **Source Data and Open Intelligence**
> Sovereign Watch ingests telemetry and intelligence from public, open-source networks (e.g., ADS-B, AIS, public API feeds). The positional data, classifications, and intelligence displayed within this platform are strictly derivative of these unencrypted, publicly broadcasted signals.

> [!WARNING]
> **Limited Liability**  
> **All data is provided "AS IS" without any warranty of accuracy, reliability, or completeness.**  
> The developers and maintainers of Sovereign Watch assume **no responsibility or liability** for:
>
> - The accuracy of real-time or historical tracking information.
> - Decisions or actions taken based on the intelligence presented by this software.
> - Disruptions to the third-party networks providing the upstream data.
>
> Sovereign Watch is designed purely for research, educational, and hobbyist data fusion purposes.

---

## Architecture Overview

```mermaid
graph TD
    subgraph "Entry Point (Nginx)"
        NG[Reverse Proxy :80]
    end

    subgraph "Ingestion (Python Pollers)"
        A[ADS-B Network] -->|JSON| B(Ingestion Services)
        C[AIS Stream] -->|JSON| B
        Z[Orbital TLE Feed] -->|TLE| B
        JS[Sovereign JS8Call] -->|UDP Bridge| B
        RP[RF Repeaters] -->|REST API| B
        B -->|TAK Protobuf| D(Redpanda Bus)
    end

    subgraph "Persistence (TimescaleDB)"
        D -->|Stream| E[(Tracks Hypertable)]
        D -->|Stream| F[(Vector Store)]
    end

    subgraph "Cognition (LiteLLM)"
        G[Fusion API] -->|Query| H{AI Router}
        H -->|Tier 1| I[Local Llama3]
        H -->|Tier 3| CL[Claude]
    end

    subgraph "Presentation (React + Deck.gl)"
        FE[MainHUD Shell] --> L[Intelligence Feed]
        FE --> M[Projective Velocity Blending]
        M -->|WebGL 3D| N[Mapbox / MapLibre Overlay]
        FE --> O[Radio Terminal]
        FE --> INF[Infrastructure Layers]
        SC[Submarine Cables] -->|REST API| FE
    end

    NG -->|/| FE
    NG -->|/api/| G
    NG -->|/js8/| JS
```

## 🗂️ Data Sources

All upstream data is sourced from **public, open-access networks**. No proprietary feeds are required for basic operation.

### ✈️ Aviation (ADS-B)

Sovereign Watch uses a **multi-source round-robin poller** with automatic failover and exponential backoff.

| Feed               | URL                                              | Notes                           |
| :----------------- | :----------------------------------------------- | :------------------------------ |
| **adsb.fi**        | [opendata.adsb.fi](https://opendata.adsb.fi)     | Primary. No key required.       |
| **adsb.lol**       | [api.adsb.lol](https://api.adsb.lol)             | Primary. No key required.       |
| **airplanes.live** | [api.airplanes.live](https://api.airplanes.live) | Backup. Throttled to 1 req/30s. |

### 🚢 Maritime (AIS)

| Feed             | URL                                  | Notes                                                                  |
| :--------------- | :----------------------------------- | :--------------------------------------------------------------------- |
| **AISStream.io** | [aisstream.io](https://aisstream.io) | WebSocket stream, requires `AISSTREAM_API_KEY`. Bounding-box filtered. |

### 🛰️ Orbital (Satellites)

TLE data is fetched from Celestrak and propagated locally via SGP4. Updated every 6 hours.

| Group       | URL                                                                            | Category  |
| :---------- | :----------------------------------------------------------------------------- | :-------- |
| GPS Ops     | [celestrak.org](https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops)     | `gps`     |
| GLONASS Ops | [celestrak.org](https://celestrak.org/NORAD/elements/gp.php?GROUP=glonass-ops) | `gps`     |
| Galileo     | [celestrak.org](https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo)     | `gps`     |
| BeiDou      | [celestrak.org](https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou)      | `gps`     |
| Weather     | [celestrak.org](https://celestrak.org/NORAD/elements/gp.php?GROUP=weather)     | `weather` |
| NOAA        | [celestrak.org](https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa)        | `weather` |

### 📻 RF Infrastructure (Repeaters)

| Feed             | URL                                                                 | Notes                                                                                                     |
| :--------------- | :------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------- |
| **RepeaterBook** | [repeaterbook.com/api](https://www.repeaterbook.com/api/export.php) | API Key Required. (working to get app approved) Proxied server-side to avoid CORS. 24h client-side cache. |

### 🌊 Undersea Infrastructure (Submarine Cables)

| Feed                    | URL                                                                    | Notes                                                                           |
| :---------------------- | :--------------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| **Submarine Cable Map** | [submarinecablemap.com/api](https://www.submarinecablemap.com/api/v3/) | No key required. Includes cable routes & landing points. 24h client-side cache. |

## 🛡️ Tactical Design ("Sovereign Glass")

- **Dual Operating Modes**: Instantly pivot between the **Tactical Map** (Aviation, Maritime, Infrastructure) and the **Orbital Map** (Satellites) to maintain focus on the relevant domain.
- **Chevron-First Architecture**: Unified directional trackers for all assets; no legacy dot markers.
- **Hybrid 3D Engine**: Seamlessly switches between **Mapbox 3D** (Terrain/Satellite) and **CARTO Dark Matter** (Vector/Local) based on configuration.
- **High-Fidelity HUD**: Integrated global TopBar with synchronized temporal references (UTC), real-time entity tracking sidebars, and active intelligence feeds.
- **Immersion Layers**: Micro-noise texture and tactical grid overlays for a professional surveillance aesthetic.
- **Interactive Vectors**: Pickable chevrons for target locking, historic trail inspection, entity telemtry drill-down, and tactical time travel (replay).

## 🗼 Tactical Indicators

### Asset Symbology

- **Chevrons**: Indicate directional heading and asset type (Aviation/Maritime). Hovering/Clicking reveals the target's specific classification.
- **Star**: Orbital assets (Satellites). Rendered at ground-track position with predicted orbital paths.
- **Pulsating Rings**: Active telemetry updates. Intensity increases when an asset is selected.
- **Tactical Outline**: High-value/special assets (SAR, Military, Law Enforcement vessels, Drones, Helicopters) emit a glowing **Tactical Orange** signature aura for instantaneous operator recognition.

### Intelligent Color Coding

The Tactical Map uses dynamic "thermal" gradients to visualize critical metadata:

**Aviation (Altitude)**

- 🟢 **Green**: Grounded / Low (< 5,000ft)
- 🟡 **Yellow**: Lower-Altitude / Approach (~ 10,000ft)
- 🟠 **Orange**: Mid-Altitude Climb/Descent (~ 20,000ft)
- 🔴 **Red**: High-Altitude Cruise (~ 30,000ft)
- 🟣 **Magenta**: Very High-Altitude (> 40,000ft)

**Maritime (Speed)**

- 🔵 **Dark Blue**: Stationary / Anchored (0 kts)
- 🟦 **Medium Blue**: Harbor Speed / Patrolling (< 10 kts)
- 🩵 **Light Blue**: Cruising (~ 15 kts)
- ⚪ **Cyan/White**: High-Speed Transit (25+ kts)

**Orbital (Category)**

- 💎 **Sky Blue**: GPS & Navigation Constellations
- 🟠 **Amber**: Weather & Environmental Monitoring
- 🟢 **Emerald**: Communication & Internet (Starlink/OneWeb)
- 🔴 **Rose**: Surveillance & Known ISR Satellites
- ⚪ **Gray**: Other / Unclassified Satellites

**Infrastructure (System)**

- 🟢 **Emerald**: RF Infrastructure (Amateur Radio Repeaters, JS8Call Stations)
- 🔵 **Cyan**: Undersea Infrastructure (Submarine Cables, Landing Stations)

## 🔍 Core Capabilities

| Capability                       | Tactical Description                                                                                                                     |
| :------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **Deep Vessel Classification**   | Real-time parsing of Maritime `ShipStaticData` to classify tankers, cargo, military, SAR, and passenger vessels with absolute precision. |
| **Orbital Pulse Tracking**       | End-to-end satellite tracking using Celestrak TLE ingestion and live SGP4 propagation (60fps PVB motion & Ground tracks).                |
| **Undersea Infrastructure**      | Global visualization of the submarine cable network and strategic landing stations with access to operational status.                    |
| **RF Infrastructure Awareness**  | Comprehensive mapping of amateur radio repeater networks across the theater for immediate access to communication relays.                |
| **JS8Call Signal Intelligence**  | Integrated HF digital mode (JS8) radio bridge and interactive HUD terminal for real-time tactical communications.                        |
| **Projective Velocity Blending** | Physics-based kinematic rendering ensures fast-moving aircraft coast smoothly between delayed transponder pings.                         |
| **Granular Filtering Matrix**    | Advanced HUD tools to strip away visual noise. Filter the theater by specific sub-classes (e.g., Drones or Military).                    |
| **Time-Travel (Historian)**      | All positional data is written to TimescaleDB. Operators can replay tactical situations from hours or days ago locally.                  |

## 📂 Directory Structure

| Path                 | Purpose                                              | Git Status  |
| :------------------- | :--------------------------------------------------- | :---------- |
| `/AGENTS.md`         | **Master Guide for AI Developers (Read This First)** | **Tracked** |
| `/.agent`            | Agent memory, skills, and global project rules.      | **Tracked** |
| `/backend/ingestion` | Python multi-source polling frameworks.              | **Tracked** |
| `/backend/db`        | Database schema (`init.sql`) and migration scripts.  | **Tracked** |
| `/backend/api`       | Python FastAPI service for Fusion and Analysis.      | **Tracked** |
| `/js8call`           | JS8Call HF Radio Terminal container and bridge.      | **Tracked** |
| `/frontend`          | React + Vite application (Tactical Map + HUD).       | **Tracked** |
| `/docs`              | Architecture plans, research, and progress logs.     | **Tracked** |

## 🤖 AI Agent Protocol

This repository is **Agent-Aware**. If you are an AI assistant contributing to this project:

1.  **Read Rules**: You **MUST** read `AGENTS.md` at the start of your session. It is the authoritative entry point.
2.  **Environment Protocol**: Never run commands (npm, pip, python) directly on the host. Always use the **Docker Compose** commands defined in the rules.
3.  **Communication**: All inter-service data must adhere to the **TAK Protocol (Protobuf)** as defined in `tak.proto`.
4.  **Aesthetics**: Follow the "Sovereign Glass" design principles for all UI modifications.

## 🧪 Development Workflow

### 🐳 The "Container-First" Rule

**Never** run commands (`npm`, `node`, `python`, `pip`, etc.) directly on the host. ALL interactions and execution must happen through **Docker Compose**.

- **Starting Services**: `docker compose up -d` (or `docker compose up -d --build <service>` after dependency changes)
- **Running One-off Tasks**: `docker compose run --rm <service> <command>`
- **Viewing Logs**: `docker compose logs -f <service>`

### ⚡ Live Updates (HMR)

Both Frontend and Backend services are configured for **Hot Module Replacement**:

- **Frontend**: Save any `.tsx`/`.ts`/`.css` file. Vite automatically syncs changes instantly (polling, 1s interval). **No restart required.**
- **Backend**: Save any `.py` file. Uvicorn reloads automatically. **No restart required.**
- **Ingestion/Misc Services**: Sometimes require restarts (`docker compose restart <service>`) upon configuration changes.

> **Note**: Only rebuild containers when altering `Dockerfile` configurations or modifying dependencies.

---

## 🤝 Contributing

We welcome contributions to Sovereign Watch! Phase 2 is currently focused on Tactical Intelligence & Tracking.

- **Pull Requests**: Please ensure your PR includes a clear description of the feature or bug fix.
- **Issue Tracker**: Use the GitHub issue tracker for feature requests, bug reports, and to ask questions.
- **AI Agent Contributions**: Please review `AGENTS.md` to ensure modifications align with system architecture and "Sovereign Glass" design principles.

---

## 🏆 Acknowledgements & Tech Stack

Sovereign Watch is built on the shoulders of giants. We extend our deep gratitude to the maintainers of these core technologies:

- **[JS8Call](http://js8call.com/)**: Robust HF digital mode protocol for weak-signal tactical communications.
- **[KiwiSDR](http://kiwisdr.com/)**: Global network of software-defined radios enabling over-the-horizon intelligence gathering.
- **[Docker](https://www.docker.com/)**: Containerization engine enabling seamless, edge-to-cloud deployments.
- **[Deck.gl](https://deck.gl/)**: High-performance WebGL2 spatial rendering.
- **[MapLibre GL JS](https://maplibre.org/) / [Mapbox GL JS](https://www.mapbox.com/)**: Core mapping engines and spherical globe projections.
- **[TimescaleDB](https://www.timescale.com/)**: Heavy-duty time-series telemetry persistence.
- **[Redpanda](https://redpanda.com/)**: High-throughput Kafka-compatible streaming bus.
- **[Celestrak](https://celestrak.org/)**: Vital orbital data propagation and TLE distribution.
- **[FastAPI](https://fastapi.tiangolo.com/) & [React](https://react.dev/)**: The core architecture powering the fusion center.

---

<div align="center">
  <p>
    <b>Sovereign Watch</b> &copy; 2026<br/>
    <i>Maintained by d3FRAG Networks & The Antigravity Agent Team.</i><br/><br/>
    <a href="#sovereign-watch">🔼 Back to Top</a>
  </p>
</div>
