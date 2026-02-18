# Sovereign Watch Release Notes

## Version 0.6.1

**Date:** February 17, 2026

### 🚀 Improvements

- **Live Search Tracking:** The Search Widget now updates entity positions in real-time, displaying live coordinates (Lat/Lon) to help operators track moving targets directly from the dropdown.
- **Enhanced Context Zoom:** Clicking a result in the Search Widget or Intelligence Stream now zooms to level **12** (previously 14), providing better tactical context of the surrounding area.

### 🐛 Bug Fixes

- **Entity Selection Logic:** Fixed sticky "Follow Mode" behavior. Selecting a new entity from the sidebar now reliably disengages tracking of the previous target.
- **Follow Mode Stability:**
  - Re-enabled auto-disable on user interaction (with a 3-second grace period) to prevent fighting against manual map pan/zoom operations.
  - Restored `isEasing` checks to prevent camera conflicts during fly-to operations.
  - Increased grace period to 3s to improve lock-on reliability for distant targets.
