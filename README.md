# Sovereign Watch

<div align="center">
  <img src="assets/images/logo.png" alt="Sovereign Watch Logo" width="260"/>

## Distributed Multi-INT Fusion Center

  <p>
    <a href="https://github.com/d3mocide/Sovereign_Watch/releases"><img src="https://img.shields.io/github/v/release/d3mocide/Sovereign_Watch?color=10B981&label=Release&style=for-the-badge" alt="Release"></a>
    <img src="https://img.shields.io/badge/Status-Phase%202%20(Active)-F97316?style=for-the-badge" alt="Status">
    <a href="https://github.com/d3mocide/Sovereign_Watch/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPLv3-06B6D4?style=for-the-badge" alt="License"></a>
    <img src="https://img.shields.io/badge/Docker-Ready-2563EB?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  </p>

  <p>
    <em>A self-hosted, edge-to-cloud intelligence platform for high-velocity telemetry (ADS-B, AIS, Orbital) and OSINT fusion.</em><br/>
    <em>It enforces data sovereignty by running on local hardware, utilizing a "Pulse" architecture and "Tiered AI" cognition.</em>
  </p>
</div>

---

## Screenshots

### Tactical Map View

![Sovereign Watch - Tactical Map](assets/images/SovereignWatch.png)

### Orbital Tracking

![Sovereign Watch - Orbital Map](assets/images/SovereignWatch-2.png)

### JS8CALL Terminal

![Sovereign Watch - JS8CALL Terminal](assets/images/SovereignWatch-3.png)

### Global Map Filters and Layers

![Sovereign Watch - Global Map Filters and Layers](assets/images/SovereignWatch-4.png)

### Dashboard View

![Sovereign Watch - Dashbaord View](assets/images/SovereignWatch-5.png)

---

## Quick Start

```bash
# 1. Clone & configure
git clone https://github.com/d3mocide/Sovereign_Watch.git
cd Sovereign_Watch
cp .env.example .env
# Edit .env — see Documentation/Configuration.md for all variables

# 2. Boot
docker compose up -d --build

# 3. Access
#   Tactical Map: http://localhost
#   API Docs:     http://localhost/api/docs
```

**Minimum config required in `.env`:**

```bash
CENTER_LAT=45.5152        # Your monitoring area
CENTER_LON=-122.6784
AISSTREAM_API_KEY=...     # Free at aisstream.io (maritime data)
VITE_MAPBOX_TOKEN=...     # mapbox.com (optional — for 3D terrain)
ANTHROPIC_API_KEY=...     # For AI track analysis (optional)
```

---

## Documentation

Full documentation is in the [`Documentation/`](./Documentation/) folder:

| Guide                                                       | Description                              |
| :---------------------------------------------------------- | :--------------------------------------- |
| [Deployment & Upgrade Guide](./Documentation/Deployment.md) | Install, run, upgrade, troubleshoot      |
| [Configuration Reference](./Documentation/Configuration.md) | All `.env` variables                     |
| [ADS-B Poller](./Documentation/pollers/ADSB.md)             | Aviation data ingestion                  |
| [AIS Maritime Poller](./Documentation/pollers/AIS.md)       | Maritime vessel positions                |
| [Space Pulse](./Documentation/pollers/Space.md)             | SGP4, SatNOGS, and Space Weather         |
| [JS8Call Radio](./Documentation/pollers/JS8Call.md)         | HF Radio / JS8Call Terminal              |
| [Infra Poller](./Documentation/pollers/Infra.md)            | Internet outages + submarine cables      |
| [RF Pulse](./Documentation/pollers/RF.md)                   | RF repeaters + NOAA weather radio        |
| [GEODENT (GDELT)](./Documentation/pollers/GEODENT.md)       | Real-time OSINT event stream             |
| [TAK Protocol Reference](./Documentation/TAK_Protocol.md)   | Internal message schema (CoT/Protobuf)   |
| [API Reference](./Documentation/API_Reference.md)           | REST endpoints + WebSocket               |
| [UI User Guide](./Documentation/UI_Guide.md)                | How to use the Tactical and Orbital maps |
| [AI Configuration](./Documentation/AI_Configuration.md)     | How to configure the AI models           |

---

## Architecture

```mermaid
graph TD
    subgraph "Entry Point (Nginx)"
        NG[Reverse Proxy :80]
    end

    subgraph "Ingestion (Python Pollers)"
        A[ADS-B Network] -->|JSON| B(Ingestion Services)
        C[AIS Stream] -->|JSON| B
        Z[Space Domain Feed] -->|TLE/SatNOGS/NOAA| B
        H3[H3 Coverage: Live Poller Pulse] -->|JSON| B
        JS[Sovereign JS8Call] -->|UDP Bridge| B
        RF[RF Pulse: ARD/NOAA/RepBook/RadioRef] -->|REST API/SOAP| B
        IN[Infra Poller: IODA/Cables] -->|REST API| B
        GD[GEODENT: GDELT Pulse OSINT] -->|TSV/REST API| B
        B -->|TAK JSON| D(Redpanda Bus)
    end

    subgraph "State & Persistence"
        D -->|Stream| E[(TimescaleDB)]
        RS[(Redis Cache)]
        B -->|Cache| RS
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
        FE --> SYS[System Settings Widget]
        FE --> INF[Infrastructure Layers]
    end

    NG -->|/| FE
    NG -->|/api/| G
    NG -->|/js8/| JS
    G -->|Read Cache| RS
```

---

## Data Sources

All upstream data is sourced from **public, open-access networks**.

| Domain            | Source                                      | Update Rate              |
| :---------------- | :------------------------------------------ | :----------------------- |
| Aviation (ADS-B)  | adsb.fi, adsb.lol, airplanes.live           | Every 2–30 seconds       |
| Maritime (AIS)    | AISStream.io WebSocket                      | Event-driven (real time) |
| Space             | Celestrak, SatNOGS, NOAA SWPC               | 5s (SGP4) / 1h (Obs)     |
| Internet Outages  | IODA (Georgia Tech)                         | Every 30 minutes         |
| Submarine Cables  | TeleGeography                               | Every 24 hours           |
| RF Infrastructure | RepeaterBook, ARD, NOAA NWR, RadioReference | Every 6–168 hours        |
| GDELT (OSINT)     | GDELTproject.org                            | Every 15 minutes         |
| WebSDR            | Global Network                              | Discovery (on-demand)    |

---

## ⚠️ Disclaimer

> [!IMPORTANT]
> Sovereign Watch ingests telemetry and intelligence from public, open-source networks (e.g., ADS-B, AIS, public API feeds). All data is strictly derivative of these unencrypted, publicly broadcasted signals.
> [!WARNING]
> **All data is provided "AS IS" without any warranty of accuracy, reliability, or completeness.** The developers assume no responsibility for decisions taken based on the intelligence presented. Sovereign Watch is designed purely for research, educational, and hobbyist data fusion purposes.

---

## AI Agent Protocol

This repository is **Agent-Aware**. Read `AGENTS.md` before contributing.

- All inter-service data must adhere to the **TAK Protocol** — see [TAK Protocol Reference](./Documentation/TAK_Protocol.md)
- Follow the "Sovereign Glass" design principles for all UI modifications
- Never run commands directly on the host — use Docker Compose

---

## Contributing

Pull requests are welcome. Please review `AGENTS.md` and the [Documentation](./Documentation/) before contributing.

- **Issues:** Use the GitHub issue tracker for bugs and feature requests
- **PRs:** Include a clear description; AI agent contributions must align with `AGENTS.md`

---

## Tech Stack

[Docker](https://www.docker.com/) · [FastAPI](https://fastapi.tiangolo.com/) · [React](https://react.dev/) · [Deck.gl](https://deck.gl/) · [MapLibre GL JS](https://maplibre.org/) · [Mapbox GL JS](https://www.mapbox.com/) · [TimescaleDB](https://www.timescale.com/) · [Redpanda](https://redpanda.com/) · [Celestrak](https://celestrak.org/) · [JS8Call](http://js8call.com/) · [KiwiSDR](http://kiwisdr.com/)

---

<div align="center">
  <p>
    <b>Sovereign Watch</b> &copy; 2026<br/>
    <i>Maintained by d3FRAG Networks & The Antigravity Agent Team.</i><br/><br/>
    <a href="#sovereign-watch">Back to Top</a>
  </p>
</div>
