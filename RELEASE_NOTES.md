# Release - v0.10.3 - Sovereign Glass: Globe Redux

This update marks a significant architectural shift in how Sovereign Watch handles spherical projections. By moving away from standard billboarding icons in favor of native geographic polygons, we have achieved absolute rendering stability in MapLibre Globe mode.

### 🌌 High-Fidelity Atmosphere
We've introduced a dedicated **Sky Atmosphere** layer. In Globe mode, you'll now see a realistic deep-space gradient transitioning into a navy horizon glow. The system intelligently detects solar orientation to simulate tactical lighting conditions.

### 📐 Geometric Precision
MapLibre v5's globe implementation has known conflicts with standard `IconLayer` depth testing. 
- **The Solution**: We've replaced these icons with procedural `PolygonLayer` triangles that are mathematically calculated to drape perfectly across the Earth's curvature.
- **The Result**: Zero flickering, zero "bleeding" through the planet, and perfect alignment with tactical headings at any zoom level.

### ⚙️ Under the Hood
- Optimized `useMapCamera` to handle rapid projection transitions without style collisions.
- Unified 3D visuals logic to ensure performance remains high even with complex atmosphere layers active.

---

## 🚀 Upgrade Instructions

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart the frontend for the new version
docker compose up -d --build frontend
```

_Monitor. Analyze. Secure._