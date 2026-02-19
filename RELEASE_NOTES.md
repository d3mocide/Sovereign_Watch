# Release - v0.7.1 - "Smooth Operator"

## Summary

This patch release focuses on **visual stability** and **frontend performance**. We've eliminated the distraction of "zigzag" artifacts in history trails caused by noisy ADS-B multilateration and fixed the "detached head" effect where trails appeared disconnected from their aircraft. Additionally, the Intelligence Stream has been optimized to handle high-volume feeds without degrading UI responsiveness.

## Key Changes

### 🎨 Visual Fidelity

- **Zigzag Fix**: Implemented smart temporal (3s) and spatial (50m) gating. Trails now only commit points that are statistically significant, smoothing out the noise from raw ADS-B feeds.
- **Gap Bridge**: Introduced a new dynamic rendering layer that connects the static history tail to the live moving aircraft. This eliminates the "floating icon" effect while preserving data integrity.

### ⚡ Performance

- **Intel Feed Optimization**:
  - **Capped Retention**: Client now stores a max of 500 events (rolling window).
  - **Render efficiency**: Only the most recent 50 events are rendered to the DOM, ensuring the Sidebar remains snappy even during event surges.

## Upgrade Instructions

No backend changes. Only a frontend rebuild is required.

```bash
# 1. Pull latest code
git pull origin main

# 2. Rebuild Frontend
docker compose up -d --build frontend
```
