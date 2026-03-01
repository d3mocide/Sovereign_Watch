# Release - v0.10.4 - Orbital Tooltip Styling

This patch update ensures that orbital entities correctly inherit their intended tactical aesthetics within the HUD, instead of falling back to default avionics styling.

### 🛰️ Orbital Metadata Refinement
Satellites in the tactical view now display precise metadata directly on hover or selection:
- **Type Accuracy**: Properly labels entities as `ORBITAL` in tooltips.
- **Speed Output**: Correctly formats orbital velocity in `km/s` rather than marine/air `kts`.
- **Aesthetic Integration**: Employs the "Sovereign Glass" purple accent (`text-purple-400` and glow) globally for all orbital interactions, replacing the generic plane icon with a specialized satellite glyph.

---

## 🚀 Upgrade Instructions

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart the frontend for the new version
docker compose up -d --build frontend
```

_Monitor. Analyze. Secure._