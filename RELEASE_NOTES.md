# Release - v0.28.4 - Replay Filter Integrity

This is a targeted bug-fix release restoring category filter behaviour during track replay for AIS vessels and ADS-B aircraft.

---

## 🗂 Replay Category Filters Now Work for Ships and Aircraft

### What was broken

When using the track replay timeline, all vessel and aircraft category filters (cargo, tanker, passenger, fishing, military, commercial, helicopter, drone, etc.) had no effect — every entity rendered on the map regardless of which filters were active. Live mode was unaffected.

### Root cause

`processReplayData` (`replayUtils.ts`) reconstructs `CoTEntity` objects from historical database rows. It correctly mapped `meta.callsign` but never mapped `meta.classification`, which is where both the AIS poller and the ADS-B poller store their classification data.

The animation loop's `filterEntity()` function reads category from two distinct top-level fields on the entity:
- Ships → `entity.vesselClassification.category`
- Aircraft → `entity.classification.affiliation` / `entity.classification.platform`

Since neither field was ever populated in replay mode, `filterEntity()` skipped all category checks for every entity and let everything through.

### Fix

`processReplayData` now maps `meta.classification` from the DB row into the correct top-level field based on entity type:

| Entity type | Source | Destination |
|---|---|---|
| Ship (CoT type contains `S`) | `meta.classification.category` | `entity.vesselClassification.category` |
| Aircraft | full `meta.classification` | `entity.classification` |

Three new tests cover ship category mapping, aircraft classification mapping, and graceful handling of rows with no classification data.

---

## 📄 Upgrade Instructions

No backend or database changes — frontend-only. For a clean pull:

```bash
git pull origin main
docker compose up -d --build frontend
```

---
*Sovereign Watch - Distributed Intelligence Fusion*
