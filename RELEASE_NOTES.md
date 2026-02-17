# Sovereign Watch v0.4.0 Release Notes

**"Hybrid Reality" Update**

Version 0.4.0 brings true 3D tactical awareness to Sovereign Watch. We've introduced a **Hybrid Rendering Engine** that seamlessly bridges high-fidelity photogrammetry (Mapbox) with high-performance vector basemaps (CARTO), ensuring mission capability in both connected and disconnected environments.

## 🌟 Key Features

### 1. Hybrid 3D Engine (Mapbox + CARTO)

The Tactical Map now operates in two distinct modes based on your environment:

- **Photorealistic 3D (Mapbox):** Full terrain depth, satellite imagery, and atmospheric lighting when connected.
- **Tactical Vector (CARTO Dark Matter):** A lightweight, high-contrast 2D/2.5D mode for local-only operations.
- **Seamless Switch:** The engine automatically degrades to CARTO if Mapbox tokens are unavailable, ensuring zero downtime.

### 2. Tactical Precision (CoT Alignment)

We've eliminated the "crabbing" effect where icons appeared misaligned with their movement paths.

- **Trail Geometry Alignment:** Icons now align with the _actual_ ground track (History Trail) rather than reported heading, providing 100% visual truth.
- **Rhumb Line Math:** Bearing calculations now use Loxodrome formulas to match the Mercator projection perfectly.
- **Inverted Rotation:** Corrected the coordinate system mismatch between DeckGL (CCW) and Compass (CW).

### 3. Immersive 3D Visualization

Even in 2D mode, we now simulate depth to improve spatial awareness:

- **Altitude Stems:** Vertical "drop lines" connect aircraft to the ground, visually anchoring high-altitude targets.
- **Dynamic Shadows:** Projected ground shadows help operators instinctively gauge altitude differences.
- **Camera Control:** New Pitch ($0^{\circ}-85^{\circ}$) and Bearing controls allow for "on-the-deck" tactical views.

### 4. Visibility Enhancements

- **Solid AOT Lines:** Maritime boundaries are now solid, authoritative lines rather than dashes.
- **Enhanced Trails:** History trails are thicker (`2.5px`), brighter, and more opaque (`0.8`), making them clearly visible against the dark map.

---

## 🔧 Technical Details

- **Version:** v0.4.0
- **Release Date:** 2026-02-16
- **Key Changes:**
  - Implemented `HybridEngine` logic in `TacticalMap.tsx`.
  - Refactored `getBearing` to support Rhumb Lines.
  - Inverted `getAngle` rotation logic.

## 🚀 Upgrade Instructions

```bash
# 1. Pull latest changes
git pull origin dev

# 2. Rebuild Frontend
docker compose up -d --build frontend
```

---

# Sovereign Watch v0.3.0 Release Notes

**"Tactical Persistence" Update**

Following the high-fidelity foundation of 0.2.0, version 0.3.0 introduces deep persistence and maritime parity. We've enhanced the operator's ability to track long-term history and standardized the tactical HUD for multi-domain operations.

## 🌟 Key Features

### 1. Global History Trails ("Hist_Tail")

Operators can now visualize the historical paths of all active entities simultaneously.

- **Global Toggle:** A new "Hist_Tail" button in the TopBar enables/disables trails for every asset on the map.
- **Persistence:** This state is stored in `localStorage`, ensuring your tactical layout persists across browser refreshes.
- **Adaptive Coloration:** Trails are automatically color-coded (Altitude for air, Speed for sea) for instant classification.

### 2. Maritime Intelligence Upgrades

Maritime tracking is no longer a secondary layer. We've brought vessels up to full visual parity with aircraft.

- **Increased Prominence:** Marine icons have been bumped to **32px**, matching the scale of commercial aviation targets.
- **Maritime Speed Legend:** A dedicated speed key (0-25+ kts) provides a visual reference for the maritime color gradients.

### 3. "Sovereign Glass" HUD Refinement

The tactical legend system has been standardized into a vertical stack in the top-left corner.

- **Stacked View:** Altitude Legend is pinned to the top, with the Maritime Legend directly beneath it.
- **Standardized Width:** All legends now share a uniform **90px** width for a cohesive "Command Center" aesthetic.
- **Muted AOR Boundaries:** Mission areas are now rendered as subtle, dashed "HUD" overlays (Aviation Circle & Maritime Square), eliminating high-contrast visual clutter.

### 4. Stability & Jitter Elimination

We've implemented the full suite of mitigations from our ADS-B Jitter Analysis.

- **Arbitration Gate:** A new cache-based filter in the poller suppresses the "duplicate storm" caused by multi-source overlap.
- **Hardware-Anchored Time:** Timestamps are now relative to the exact moment of HTTP receipt, eliminating lag-induced time travel.
- **Zero-Overshoot Interpolation:** The map no longer extrapolates paths beyond the last update, killing the "snap-back" rubber-banding effect.
- **Trail Smoothing:** History trails are now filtered for GPS/Multilateration noise, resulting in clean paths even at high zoom.

---

## 🔧 Technical Details

- **Version:** v0.3.0
- **Release Date:** 2026-02-15
- **Compatibility:** Requires Docker Compose v2.0+
- **Key Changes:**
  - Standardized legend positioning logic in `TacticalMap.tsx`.
  - Added `SpeedLegend.tsx` component.
  - Implemented `showHistoryTails` state management across `App.tsx` and `TopBar.tsx`.

## 🚀 Upgrade Instructions

```bash
# 1. Pull latest changes
git pull origin dev

# 2. Rebuild Frontend
docker compose up -d --build frontend
```

---

_Release 0.3.0 is live. Tactical baseline elevated._
