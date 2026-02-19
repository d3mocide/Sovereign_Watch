# Release — v0.7.2 — "Steady State"

## Summary

v0.7.2 is a targeted stability patch for the ADS-B tracking pipeline. It resolves four root-cause bugs identified during a deep-dive code review of the Dead Reckoning (DR) subsystem: two in the frontend PVB interpolation loop and two in the backend arbitration layer. Together, these fixes eliminate the remaining source of occasional icon heading snaps, post-tab-switch position jumps, north-boundary rotation glitches, and multilateration duplicate bursts that caused rubberbanding on multi-source ADS-B data.

No new features. No breaking changes. No dependency updates.

---

## What's Fixed

### Frontend — `TacticalMap.tsx`

**DR Heading Fallback (read-after-write bug)**
The kinematic heading fallback — which computes icon bearing from delta position when the trail is too short — was reading `drStateRef.current.get(uid)` _after_ `drStateRef.current.set(uid, ...)`. The returned state was always the freshly-written current position, making the distance calculation always zero and the fallback bearing always unused. New entities and entities recovering from a data gap now compute a real kinematic heading from their position delta.

**Smoothing explosion on post-pause resume**
The exponential lerp used a `dt` already capped at 100ms (physics guard), but `smoothFactor = 1 - (1 - 0.25)^(dt/16.67)` at `dt=100ms` evaluates to ~0.73 — a 73% position jump in a single frame. A separate 33ms cap on the smoothing input (`smoothDt`) keeps blending gradual after tab-switch, GC pause, or CPU spike.

**Icon rotation at north boundary**
`blendCourseRad` is interpolated in `[-π, π]` range and could be negative when crossing 0°/360°. The conversion to degrees was not clamped, allowing negative course values to be passed to `getAngle`, reversing the icon's rotation direction near north. Fixed with `(angle + 360) % 360`.

### Backend — `main.py`

**MLAT duplicate suppression threshold**
`ARBI_MIN_SPATIAL_M` raised from **30m → 100m**. When two ground-station-based ADS-B feeders (e.g., adsb.fi + adsb.lol) triangulate the same aircraft, their MLAT positions routinely differ by 40–90m. The old 30m threshold allowed both reports to bypass the temporal arbitration gate and publish near-simultaneously to Kafka. The frontend received two near-identical packets within ~100ms and had to snap between them. At 100m, MLAT noise is correctly suppressed; genuine fast-mover position changes still pass the temporal gate normally.

---

## Upgrade

```bash
git pull
docker compose restart adsb-poller
# Frontend updates via HMR — no rebuild required
```

---

## Known Issues

- **CoT Tracking:** Native Cursor-on-Target entity tracking remains non-functional (scheduled).
- **Residual Jitter:** Occasional sub-second jitter may still occur on MLAT-only aircraft with no transponder course field; investigation ongoing.
