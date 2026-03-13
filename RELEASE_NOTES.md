# Release - v0.28.1 - Tactical Depth & Spectral Clarity

This release focuses on refining the tactical visual stack and expanding the signal intelligence capabilities of the Listening Post. We've introduced dynamic spectrum zooming and resolved long-standing layer occlusion issues to ensure critical data remains visible and actionable.

## 🚀 Key Features

- **Waterfall Zoom Suite**: Operators can now zoom into the spectrum in the Listening Post. The system intelligently scales the spectral display while keeping the audio center frequency locked, enabling precise signal analysis.
- **Hierarchical Global Network Mapping**: The "Global Network" infrastructure toggle has been re-engineered. A new master switch now controls Undersea Cables and Internet Outages as a unified group, allowing for cleaner layer management.
- **Geodesic Indicator Rendering**: Tactical indicators (aviation/maritime mission areas) now use geodesic math to render perfectly on the 3D globe, eliminating visual distortion at the horizon.

## 🔧 Technical Improvements

- **Depth Stack Calibration**: Implemented a comprehensive `depthBias` strategy. Tactical entities (icons, trails, halos) now consistently render in front of high-density background layers like Internet Outages and Submarine Cables.
- **Map Style Persistence**: Fixed the map style lifecycle so that exiting Globe view automatically reverts the basemap to the high-contrast Tactical Dark style.
- **Spectral Palette Tuning**: Optimized the waterfall dynamic range and color palette for better signal-to-noise visualization in high-interference environments.

## 📄 Upgrade Instructions

To upgrade to v0.28.1, pull the latest changes and rebuild the frontend:

```bash
git pull origin main
docker compose build frontend
docker compose up -d
```

---
*Sovereign Watch - Distributed Intelligence Fusion*
