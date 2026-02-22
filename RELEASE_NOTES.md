# Release — v0.9.0 — Tactical Glass & Globe Repair

**Date:** 2026-02-21
**Version:** `0.9.0`
**Codename:** Tactical Glass

---

## Summary

v0.9.0 marks the full activation of **Globe View** and the debut of the **Tactical Halo System**. This update focuses on precision rendering and UI refinement, resolving complex depth-occlusion challenges (z-fighting) and standardizing the tactical design language ("Sovereign Glass") across the Intelligence Feed and Map layers.

The new **Tactical Halo** replaces redundant icon outlines with a soft, concentric amber glow that is locked to asset billboarding, ensuring high-value targets (Military, SAR, Drones) are instantly recognizable in any projection mode.

---

## Key Features

### 🛡️ Tactical Halo System

- **Locked-to-Icon Monitoring**: A new procedural sprite-based halo that tracks perfectly with entity rotation and camera-facing billboarding.
- **Focused Highlighting**: Tight 32px radial glow ensures special assets pop against the dark tactical grid without obscuring mission-critical data.

### 🌎 Globe view Functional

- **Spherical Surface Support**: Complete re-alignment of tactical layers (trails, footprints, altitude stems) for MapLibre GL v5 and Mapbox v3.
- **Occlusion Repair**: Fixed "clipping" issues where icons would disappear into the horizon or ground terrain during globe transitions.

### 🛠️ UI & Header Refinements

- **Localized UI Controls**: Moved the 2D/3D and Globe View toggles from the global `TopBar` directly onto the `TacticalMap` surface for localized interaction.
- **HUD De-cluttering**: Removed redundant `Orb_Layer` and Map-mode buttons from the global navigation bar to maximize vertical space for mission data.
- **Gutter-Aligned Controls**: Relocated expansion chevrons to the right side of the filter widget, creating a cleaner vertical alignment with the toggle switches.
- **Standardized Intel Feed**: Unified header styling across AIR, SEA, and ORBITAL categories.

---

## Technical Details

| Component          | Change                                                           |
| ------------------ | ---------------------------------------------------------------- |
| `TacticalMap.tsx`  | Unified `depthBias` matrix; Refactored highlights to `IconLayer` |
| `createIconAtlas`  | Expanded atlas to `128x128` with procedural `halo` glow sprite   |
| `LayerFilters.tsx` | Relocated expansion arrow JSX structure for alignment            |
| `App.tsx`          | Standardized `interleaved` rendering across all map adapters     |

---

## Upgrade Instructions

```bash
# Pull latest
git pull origin main

# Rebuild frontend to ingest new icon atlas and depth logic
docker compose build frontend

# Restart services
docker compose up -d
```

---

## Verification Results

| Test Case                | Status | Notes                                             |
| :----------------------- | :----- | :------------------------------------------------ |
| Globe view CoT rendering | Pass   | High-accuracy tracking on spherical projection.   |
| Tactical Halo Z-Ordering | Pass   | No flickering observed with elevation indicators. |
| Filter Header Layout     | Pass   | Alignment consistent with design mockup.          |

---

_Sovereign Watch is maintained by d3FRAG Networks & The Antigravity Agent Team._
