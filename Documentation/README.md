# Sovereign Watch — Documentation

> **Wiki-style reference for operators, developers, and contributors.**
> Start here to navigate the full documentation suite.

---

## Table of Contents

### Getting Started

| Document                                      | Description                                                 |
| :-------------------------------------------- | :---------------------------------------------------------- |
| [Deployment & Upgrade Guide](./Deployment.md) | Install, configure, run, and upgrade Sovereign Watch        |
| [Configuration Reference](./Configuration.md) | Complete `.env` variable reference for every service        |
| [Development Setup Guide](./Development.md)   | Editor/IDE setup, LSP config, AI coding tools, dev workflow |

### Intelligence Pollers

Each poller is a standalone microservice that ingests data from external sources and publishes it to the Redpanda message bus in TAK-compatible JSON format.

| Document                                      | Poller                              | Container                |
| :-------------------------------------------- | :---------------------------------- | :----------------------- |
| [ADS-B Poller Guide](./pollers/ADSB.md)       | Aviation / ADS-B transponders       | `sovereign-adsb-poller`  |
| [AIS Maritime Poller Guide](./pollers/AIS.md) | Maritime vessel positions           | `sovereign-ais-poller`   |
| [Space Pulse Guide](./pollers/Space.md)       | SGP4, SatNOGS, Space Weather        | `sovereign-space-pulse`  |
| [JS8Call Radio Guide](./pollers/JS8Call.md)   | HF Radio / JS8Call Terminal         | `sovereign-js8call`      |
| [Infra Poller Guide](./pollers/Infra.md)      | Internet outages + submarine cables | `sovereign-infra-poller` |
| [RF Pulse Guide](./pollers/RF.md)             | RF repeaters + NOAA weather radio   | `sovereign-rf-pulse`     |

### Intelligence Systems & AI

| Document                                                | Description                                                       |
| :------------------------------------------------------ | :---------------------------------------------------------------- |
| [Analyst Layer Architecture](./Analyst_Layer.md)        | Risk taxonomy, HMM, escalation detector, scoring formulas, domain model pattern |
| [TAK Clausalizer & Threat Detection](./TAK_Clausalizer.md) | Autonomous 4-phase semantic state-change analysis system         |
| [Regional Risk Analysis](./Regional_Risk_Analysis.md)   | Multi-INT regional threat assessment and AI router                |

### Architecture & Protocols

| Document                                    | Description                                                       |
| :------------------------------------------ | :---------------------------------------------------------------- |
| [TAK Protocol Reference](./TAK_Protocol.md) | Internal message schema (Protobuf / CoT) used across all services |
| [API Reference](./API_Reference.md)         | All REST endpoints, WebSocket feed, and SSE streaming             |
| [AI Configuration](./AI_Configuration.md)   | How to configure the AI models                                    |

### User Guides

| Document                                | Description                                                       |
| :-------------------------------------- | :---------------------------------------------------------------- |
| [Frontend UI User Guide](./UI_Guide.md) | How to operate the Tactical Map, Orbital Map, and all HUD widgets |
| [Intel Globe Mode](./INTEL_Globe_Mode.md) | OSINT-centric 3D view for global situational awareness |

---

## Quick-Reference: Polling Rates

| Service | Source                        | Interval                          |
| :------ | :---------------------------- | :-------------------------------- |
| ADS-B   | adsb.fi                       | Every **2 seconds**               |
| ADS-B   | adsb.lol                      | Every **2 seconds**               |
| ADS-B   | airplanes.live                | Every **30 seconds** (backup)     |
| ADS-B   | Holding Patterns              | Real-time analysis (**Ingest-05**) |
| AIS     | AISStream.io                  | **Event-driven** WebSocket stream |
| Space   | Celestrak TLE fetch           | Every **6 hours**                 |
| Space   | SGP4 propagation              | Every **5 seconds**               |
| Space   | SatNOGS Network (Obs)         | Every **1 hour**                  |
| Space   | NOAA Aurora Forecast          | Every **5 minutes**               |
| Space   | NOAA Kp-Index                 | Every **15 minutes**              |
| Infra   | IODA internet outages         | Every **30 minutes**              |
| Infra   | Submarine cables & stations   | Every **24 hours**                |
| RF      | Amateur Radio Directory (ARD) | Every **24 hours**                |
| RF      | NOAA Weather Radio            | Every **168 hours** (weekly)      |
| RF      | RadioReference                | Every **24 hours**                |

---

## System Architecture (Summary)

```text
[External Sources] → [Python Pollers] → [Redpanda Kafka Bus] → [TimescaleDB]
                                    ↘ [Redis Cache]
[Frontend React/Deck.gl] ← [FastAPI Backend] ← [TimescaleDB / Redis]
```

All inter-service data flows through the **TAK Protocol** — a simplified Cursor on Target (CoT) schema serialized as JSON. See [TAK Protocol Reference](./TAK_Protocol.md) for the full schema.

---

## Contributing

See [Development Setup Guide](./Development.md) for editor, LSP, and AI tool configuration.
See [AGENTS.md](../AGENTS.md) for the AI agent protocol and development rules.
See [CLAUDE.md](../CLAUDE.md) for Claude Code-specific overrides.
