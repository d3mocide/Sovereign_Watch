# Sovereign Watch v0.2.0 Release Notes

**"High Fidelity" Update**

We are proud to announce version 0.2.0 of Sovereign Watch. This release focuses on transforming the Tactical Map from a basic position plotter into a professional-grade situational awareness tool. We have completely rewritten the rendering pipeline, optimized data ingestion, and eliminated visual artifacts for a buttery-smooth operator experience.

## 🌟 Key Features

### 1. High-Fidelity Rendering Engine

The Tactical Map now uses a custom WebGL logic layer to render thousands of entities with zero lag.

- **Canvas-Based Icons:** Replaced generic triangles with distinct, high-performance silhouettes for Aircraft (Delta Wing) and Vessels (Hull).
- **Smooth Trails:** Flight paths are now rendered with Chaikin smoothing algorithms, creating organic, curved trails instead of jagged lines.
- **Velocity Vectors:** Moving targets now project 45-second velocity vectors, giving operators instant visual cues on heading and speed.

### 2. "Sovereign Glass" Aesthetic

We've refined the UI to match our "Dark / Glass" design language.

- **Dynamic Gradients:**
  - **Aviation:** Altitude is now heat-mapped (Teal → Green → Orange → Red) for instant situational awareness of flight levels.
  - **Maritime:** Speed is encoded (Blue → Orange), allowing operators to spot fast-moving interceptors at a glance.
- **Pulsating Glows:** Active entities now pulse with a "heartbeat" animation (phase-shifted to avoid visual synchronization artifacts).

### 3. Jitter Elimination & Performance

We tackled the "rubber-banding" and "freezing" issues plaguing fast-moving aircraft.

- **Dead Reckoning:** The interpolation engine now allows aircraft to "coast" for up to 10x the update interval. Fast jets no longer freeze when data lags.
- **Strict Monotonicity:** We implemented a strict partial-update filter that rejects out-of-order packets. Your timeline never moves backward.
- **Latency Compensation:** The backend now subtracts transmission latency from timestamps, ensuring that the map represents the _actual_ position time, not the arrival time.

### 4. Optimized Ingestion

The python `adsb-poller` has been turbocharged.

- **Weighted Polling:** Intelligently rotates between `adsb.fi`, `adsb.lol`, and `airplanes.live` to maximize data freshness without hitting rate limits.
- **4x Throughput:** Polling loops now run every 0.5s (down from 2.0s), providing near real-time updates for local traffic.

---

## 🔧 Technical Details

- **Version:** v0.2.0
- **Release Date:** 2026-02-15
- **Compatibility:** Requires Docker Compose v2.0+
- **Breaking Changes:**
  - Legacy `aviation_ingest.yaml` configuration removed.
  - `CoTEntity` TypeScript interface updated with `lastSourceTime`.
  - Frontend now requires `types.ts` synchronization with backend Protobuf definitions.

## 🚀 Upgrade Instructions

```bash
# 1. Pull latest changes
git pull origin main

# 2. Rebuild Frontend (Required for new rendering engine)
docker compose up -d --build frontend

# 3. Restart Poller (Required for ingestion optimization)
docker compose restart adsb-poller
```

_Fly safe. Watch the skies._
