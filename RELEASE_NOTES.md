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
