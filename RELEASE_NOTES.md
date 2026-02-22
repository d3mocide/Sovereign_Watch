# Release - v0.9.2 - Tactical Aesthetic Restoration

## High-Level Summary

Version 0.9.2 focuses on a comprehensive "Sovereign Glass" aesthetic restoration and structural UI polish. This release restores the premium tactical feel of the primary mission-critical widgets, specifically the Tracking Compass, while decluttering the intelligence stream and sidebar to improve focus and reduce cognitive load for operators.

## Key Features

### 🧭 HUD-Grade Compass Restoration

The tactical compass has been upgraded from a basic directional indicator to a high-fidelity HUD component:

- **Mission-Critical Symbology**: Restored internal tactical crosshairs and degree markers.
- **Dynamic Field of View**: The component now scales perfectly to any size (upscaled to 180px in the primary sidebar).
- **Theme Consistency**: Cardinal labels (N, E, S, W) now dynamically match the entity theme (Cyan for ships, Purple for satellites) instead of static defaults.

### 🛰️ Streamlined Orbital Intelligence

- **Message Clarity**: Selection events are now cleaner, removing redundant prefixes and stripping category parentheses from the Intel Feed.
- **Categorized Badging**: Relies on the newly implemented tactical badging for object classification, eliminating text-based redundancy.

### 🧹 Interface Decluttering

- **Sidebar Consolidation**: Removed the redundant "Classification" row from the metadata section to maximize vertical space for mission-critical telemetry.

## Technical Details

- **Dynamic Scaling Engine**: Implemented in `Compass.tsx` using relative coordinate calculations for needle length, tail projection, and surface glare.
- **Structural Alignment**: Fixed "glare drift" by wrapping circular elements in a dedicated flexbox-centered container.
- **Regex Cleaning**: Implemented in `App.tsx` for real-time string normalization of multi-source telemetry data.

## Upgrade Instructions

```bash
# Pull latest changes and rebuild UI
docker compose pull
docker compose up -d --build frontend
```
