# Release v0.14.1 - Orbital UI Polish

This patch release focuses on refining the Orbital Map interface, bringing the new satellite dashboard sidebars and filters into strict alignment with the existing tactical UI schema. We've also cleaned up the 3D globe presentation by removing its artificial vignette effect for a pristine void backdrop.

## 🎨 UI Enhancements

- **Tactical Parity:** Full alignment of the Orbital dashboard sidebars and filter widgets with the core tactical UI language.
- **Globe Clarity:** Removed the dark radial vignette overlay from the HUD, significantly improving the aesthetics of the 3D globe projection.

## 📋 Upgrade Instructions

This is a frontend-only UI update. No backend rebuilds are necessary.

```bash
# Update local repository
git pull origin main

# Rebuild frontend
docker compose down
docker compose up -d --build frontend
```

---

_Operational Status: v0.14.1 Deployed._
