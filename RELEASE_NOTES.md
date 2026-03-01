# Release - v0.11.0 - RF Infrastructure Awareness

This minor release introduces comprehensive mapping and intelligence tracking for RF infrastructure, explicitly focusing on the Amateur Radio Repeater network. This enhancement provides operators with critical context regarding vital communication relays across the Area of Responsibility (AOR).

### 📡 New Capabilities 
- **RF Infrastructure Layer**: Visualize active radio repeaters directly on the tactical map alongside dynamic air, sea, and orbital traffic.
- **Detailed Telemetry**: Clicking on a repeater reveals a tailored sidebar with essential signal intelligence, including operating frequencies, CTCSS tones, offsets, and operational status.
- **Streamlined HUD**: Map layer filtering has been tightly integrated into the System Status widget header, simplifying layer management without sacrificing precious screen real estate.

---

## 🚀 Upgrade Instructions

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart the frontend & backend for the new version
docker compose up -d --build frontend backend
```

_Monitor. Analyze. Secure._