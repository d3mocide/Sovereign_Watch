# Release - v0.58.0 - "Infrastructure & Orbital Tracking"

## High-Level Summary
This release marks a significant expansion of the **Sovereign Watch** infrastructure and orbital intelligence suite. We have integrated real-time tracking for the **International Space Station (ISS)** and synchronized global internet exchange metadata from **PeeringDB**. Additionally, this release formalizes our **V1.0 Readiness Pivot**, cleaning up legacy documentation and prioritizing security and reliability for the path to a full release candidate.

---

## Key Features

### 📡 Internet Infrastructure (Initiative B Phase 1)
- **PeeringDB Integration**: Automatic daily ingestion of global Internet Exchange Points (IXPs) and Data Center facilities.
- **Interactive Mapping**: New cyan diamond (IXP) and purple dot (Facility) markers in the `GLOBAL NETWORK` layer, providing deep context for terrestrial traffic flows.
- **BBox Query Support**: Optimized spatial queries for high-density infrastructure visualization.

### 🛰️ Orbital Intelligence
- **ISS Real-time Tracking**: 5-second position updates with low-latency WebSocket streaming.
- **Animated Ground-track**: Smoothly transition from 2D and 3D views with a rolling orbital path fade effect.
- **Historical Analysis**: Integrated with TimescaleDB for high-resolution pass archival.

### 🏛️ Strategic Consolidation
- **Unified Roadmap**: Consolidated all fragmented roadmap files into a single source of truth at the project root.
- **V1.0 Reliability Focus**: Shifted development priority to **Authentication (JWT)**, **CI/CD Hardening**, and **Jetson Nano hardware optimization**.

---

## Technical Details
- **TimescaleDB**: New `iss_positions` hypertable created with 30-day retention and compression.
- **Backend**: Added `iss.py` and `infra.py` routers with WebSocket support.
- **Frontend**: Lightweight `useISSTracker` hook with exponential backoff and REST fallback.
- **Z-Ordering**: Fine-tuned Deck.gl layer stacking to prevent flickering between orbital and terrestrial layers in Globe mode.

---

## Upgrade Instructions
To deploy the new features and schema updates:

```bash
# 1. Pull latest changes
git pull origin main

# 2. Rebuild and restart containers
docker compose up -d --build
```

---

- **Released By**: Sovereign Watch Agent
- **Date**: 2026-03-29
