# Sovereign Watch — Documentation

> **Wiki-style reference for operators, developers, and contributors.**
> Start here to navigate the full documentation suite.

---

## Table of Contents

### Getting Started

| Document                                      | Description                                          |
| :-------------------------------------------- | :--------------------------------------------------- |
| [Deployment & Upgrade Guide](./Deployment.md) | Install, configure, run, and upgrade Sovereign Watch |
| [Configuration Reference](./Configuration.md) | Complete `.env` variable reference for every service |
| [Development Setup Guide](./Development.md) | Editor/IDE setup, LSP config, AI coding tools, dev workflow |

### Intelligence Pollers

Each poller is a standalone microservice that ingests data from external sources and publishes it to the Redpanda message bus in TAK-compatible JSON format.

| Document                                      | Poller                              | Container                 |
| :-------------------------------------------- | :---------------------------------- | :------------------------ |
| [ADS-B Poller Guide](./pollers/ADSB.md)       | Aviation / ADS-B transponders       | `sovereign-adsb-poller`   |
| [AIS Maritime Poller Guide](./pollers/AIS.md) | Maritime vessel positions           | `sovereign-ais-poller`    |
| [Orbital Pulse Guide](./pollers/Orbital.md)   | Satellite tracking via TLE + SGP4   | `sovereign-orbital-pulse` |
| [Infra Poller Guide](./pollers/Infra.md)      | Internet outages + submarine cables | `sovereign-infra-poller`  |
| [RF Pulse Guide](./pollers/RF.md)             | RF repeaters + NOAA weather radio   | `sovereign-rf-pulse`      |

### Architecture & Protocols

| Document                                                | Description                                                       |
| :------------------------------------------------------ | :---------------------------------------------------------------- |
| [TAK Protocol Reference](./TAK_Protocol.md)             | Internal message schema (Protobuf / CoT) used across all services |
| [API Reference](./API_Reference.md)                     | All REST endpoints, WebSocket feed, and SSE streaming             |
| [AI Configuration](./AI_Configuration.md) | How to configure the AI models                                    |

### User Guides

| Document                                | Description                                                       |
| :-------------------------------------- | :---------------------------------------------------------------- |
| [Frontend UI User Guide](./UI_Guide.md) | How to operate the Tactical Map, Orbital Map, and all HUD widgets |

---

## Quick-Reference: Polling Rates

| Service | Source                        | Interval                          |
| :------ | :---------------------------- | :-------------------------------- |
| ADS-B   | adsb.fi                       | Every **2 seconds**               |
| ADS-B   | adsb.lol                      | Every **2 seconds**               |
| ADS-B   | airplanes.live                | Every **30 seconds** (backup)     |
| AIS     | AISStream.io                  | **Event-driven** WebSocket stream |
| Orbital | Celestrak TLE fetch           | Every **6 hours**                 |
| Orbital | SGP4 propagation              | Every **5 seconds**               |
| Infra   | IODA internet outages         | Every **30 minutes**              |
| Infra   | Submarine cables & stations   | Every **24 hours**                |
| RF      | RepeaterBook                  | Every **6 hours**                 |
| RF      | Amateur Radio Directory (ARD) | Every **24 hours**                |
| RF      | NOAA Weather Radio            | Every **168 hours** (weekly)      |
| RF      | RadioReference                | Every **24 hours**                |

---

## System Architecture (Summary)

```
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
