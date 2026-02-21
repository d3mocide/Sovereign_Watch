# Release — v0.8.1 — Orbital Intelligence Layer

**Date:** 2026-02-21
**Version:** `0.8.1`
**Codename:** Orbital Pulse

---

## Summary

v0.8.1 delivers the **Orbital Intelligence Layer** — a full end-to-end satellite tracking pipeline from Celestrak TLE ingestion through live SGP4 propagation, Kafka messaging, and real-time visualization on the tactical map. Operators can now see the complete vertical picture from ground-level assets up to LEO/MEO/GEO, with satellite category filtering (GPS, Weather, Comms, Surveillance) and AOR pass-prediction intelligence events.

This release also lays the complete frontend groundwork for **Globe View** — a spherical map projection that renders the world as a sphere for extreme-altitude satellite contextual awareness. Globe View is wired and ready; it activates once the MapLibre GL v5 dependency upgrade is confirmed safe (tracked in the Phase 8 roadmap).

---

## Key Features

### 🛰️ Orbital Pulse Ingestion (Backend)

- **New service:** `sovereign-orbital-pulse` — Python daemon polling Celestrak every 6 hours for GPS, Weather, Surveillance, Comms, and Active satellite TLE sets
- **Live SGP4 propagation:** numpy-accelerated, 30-second micro-batched orbital position resolution
- **TAK Protocol integration:** Produces `a-s-K` typed messages to the new `orbital_raw` Redpanda topic, fully consistent with the existing multi-INT pipeline

### 🗺️ Orbital Visualization Layer (Frontend)

- **`OrbitalLayer.tsx`** — Deck.gl overlay rendering:
  - Category-color-coded satellite markers (⊕ cross icons)
  - Ground track projection lines (next 90 min of orbit)
  - Footprint circles (sensor/comms coverage at altitude)
- **Satellite telemetry sidebar:** NORAD ID, altitude (km), velocity (km/s), inclination, orbital period, category
- **AOR pass prediction:** When a satellite's footprint overlaps the mission AOR, an `orbital` INTEL event is emitted to the intelligence feed

### 🔭 Globe View Groundwork

- `Globe_View` toggle wired in `TopBar.tsx` → `App.tsx` → `TacticalMap.tsx`
- Dual-path projection logic: `map.setProjection()` (Mapbox GL) with `setStyle` fallback (MapLibre GL)
- State persisted to `localStorage`
- **Status:** Ready — pending MapLibre GL v5 compatibility research

### 🔧 Fixes

- Satellite category filter now correctly reads `entity.detail?.classification?.category` (was reading wrong proto path)
- Satellite marker colors now exactly match filter chip colors across `OrbitalLayer.tsx` and `LayerFilters.tsx`
- Intel feed no longer flooded by per-frame orbital footprint intersection events

---

## Technical Details

| Component          | Change                                                                             |
| ------------------ | ---------------------------------------------------------------------------------- |
| New service        | `backend/ingestion/orbital_pulse/`                                                 |
| New Kafka topic    | `orbital_raw`                                                                      |
| New frontend layer | `frontend/src/layers/OrbitalLayer.tsx`                                             |
| Modified           | `TacticalMap.tsx`, `App.tsx`, `TopBar.tsx`, `SidebarRight.tsx`, `LayerFilters.tsx` |
| Dependencies       | No new npm or pip dependencies beyond existing `sgp4`, `numpy`                     |
| Known blocker      | MapLibre GL JS v3.6.2 does not support `setProjection()` — tracked for v5 upgrade  |

---

## Upgrade Instructions

```bash
# Pull latest
git pull origin main

# Full system rebuild (new orbital-pulse service)
docker compose up -d --build

# Verify new service is running
docker compose logs -f orbital-pulse
```

> **Note:** The `orbital_raw` Kafka topic is created automatically on first start. No manual schema migration is required.

---

## Known Issues

- **Globe View non-functional without MapLibre GL v5:** The UI toggle exists and state is managed, but the projection API is not available in the current MapLibre GL v3.6.2 build. See `FEATURE-ROADMAP-PHASE-8.md` for the upgrade research checklist.

---

_Sovereign Watch is maintained by d3FRAG Networks & The Antigravity Agent Team._
