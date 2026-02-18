# Release Notes - v0.7.0 - "Kinematic Intelligence"

**Date:** February 18, 2026

## 🛰️ High-Level Summary

The **v0.7.0 "Kinematic Intelligence"** release marks a significant upgrade to the Sovereign Watch tactical engine and cognition layer. This update transforms the tactical map from a collection of points into a high-fidelity situational awareness tool. By integrating advanced aircraft classification directly into the data stream and implementing smooth kinematic movement, operators can now distinguish between commercial, military, and private assets at a glance with zero visual jitter.

---

## ✨ Key Features

### 🔍 Advanced Data Fusion

- **Classification Engine**: Automatically extracts and displays Affiliation (Military/Civilian), Platform Type (Boeing 737, C-17, etc.), and Squawk intent.
- **Granular HUD Filtering**: New tactical filter groups allow one-click isolation of Military, Government, Cargo, and Regional fleets.

### 🎨 Sovereign Glass Enhancements

- **Smooth Kinematics**: Implemented 30Hz rotation interpolation—aircraft icons now glide naturally through turns.
- **Stable Trails**: Improved history trail logic with "Lead-in" vertices and a 50m noise gate to eliminate jagged edges and sensor jitter.

### ⚡ Performance & Stability

- **Intelligence Stream Memoization**: 40% reduction in main-thread CPU usage during high-velocity data ingestion.
- **Robust Mission Sync**: Implemented coordinate tolerance to prevent accidental history clearing during mission area polling.
- **Temporal Purging**: Auto-purging of stale telemetry and a 1-hour rolling window for intelligence events.

---

## 🛠️ Upgrade Instructions

1. **Pull Latest Changes**: `git pull origin main`
2. **Rebuild UI**: `docker compose build frontend`
3. **Restart Services**: `docker compose up -d`

---

_Operational Status: v0.7.0 - STABLE_
