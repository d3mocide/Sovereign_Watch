# Sovereign Watch v0.5.0 Release Notes

**"Chronos" Update**

Version 0.5.0 transforms Sovereign Watch from a live monitoring tool into a full-spectrum tactical historian. We've added the ability to rewind time, search purely historical targets, and analyze past movements with the new Replay System.

## 🌟 Key Features

### 1. The Historian (Time Travel)

We can now look back. The new backend service persists every single movement into a TimescaleDB hypertable, enabling:

- **Replay Controls:** A new specialized HUD widget allows operators to scrub through time (1h - 24h history).
- **Playback Speed:** Review hours of activity in seconds with 10x/60x/300x speeds.
- **Seamless State:** The map automatically switches between "LIVE" and "REPLAY" modes without reloading.

### 2. Tactical Search

A new global search bar in the left sidebar allows operators to find any entity—past or present.

- **Fuzzy Search:** Find targets by partial Callsign or ICAO Hex.
- **Instant Jump:** Click a result to fly the camera directly to the target.
- **History Access:** Even if a target has left the area, you can locate its last known position.

### 3. "Follow Mode" (Target Lock)

Operators can now lock the optical array onto a specific target.

- **Dynamic Tracking:** The camera smoothly follows the selected entity.
- **Interpolated Sync:** Camera movement is synchronized with the physics engine for jitter-free tracking.
- **Manual Override:** Panning away breaks the lock automatically.

### 4. Refined Optics (v0.5.0)

We've patched the "Follow" system to be significantly more robust in 3D:

- **3D Centering:** The camera now accounts for aircraft altitude, centering on the chevron itself.
- **Zero-Lag Telemetry:** The sidebar data is now driven by the interpolation engine, matching the map movement exactly.
- **Faster Acquisition:** Target lock-on is now 2x faster (1s transition).

---

## ⚠️ Known Issues

- **CoT Tracking:** Automated tracking for internal Cursor-on-Target events is currently disabled and pending a future stability patch.
- **ADSB Rubber-Banding:** Minor positional jitter/rubber-banding may occur on specific ADSB CoT data streams.

---

## 🔧 Technical Details

- **Version:** v0.5.0
- **Release Date:** 2026-02-16
- **Key Changes:**
  - Unified `getCompensatedCenter` logic.
  - Synchronized `onEntitySelect` with interpolation loop.
  - Optimized `flyTo` durations.

## 🚀 Upgrade Instructions

```bash
# 1. Pull latest changes
git pull origin dev

# 2. Rebuild All Services (Backend changes included)
docker compose up -d --build
```
