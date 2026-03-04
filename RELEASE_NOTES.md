# Release - v0.15.0 - Orbital Pass Prediction

## Summary

Sovereign Watch v0.15.0 closes the final gap in the orbital situational awareness pipeline: the pass prediction engine. Prior to this release, the `PassPredictorWidget`, `DopplerWidget`, and `PolarPlotWidget` rendered empty because no backend API existed to drive them. This release implements the full end-to-end stack — from persistent TLE storage through SGP4 propagation to a live-polling React hook — so operators now see upcoming satellite passes, Doppler slant-range curves, and polar arc geometry in real time.

---

## Key Features

- **`GET /api/orbital/passes`** — Predicts satellite passes for an observer location within a configurable time window (default 6 hours). Uses 10-second SGP4 stepping, TEME→ECEF→topocentric coordinate transforms, and AOS/TCA/LOS crossing detection. Response includes a `points[]` array per pass for immediate widget rendering.

- **`GET /api/orbital/groundtrack/{norad_id}`** — Propagates one satellite through a configurable window (default 90 min / one orbit) and returns `{t, lat, lon, alt_km}` points for map overlay use.

- **Persistent `satellites` Table** — A plain (non-hypertable) PostgreSQL lookup table that stores the latest TLE and orbital metadata per NORAD ID. Unaffected by the 24-hour `tracks` retention policy, so pass predictions always have fresh TLEs available.

- **Historian TLE Upsert** — The Historian service now performs an `INSERT … ON CONFLICT DO UPDATE` into `satellites` on every `orbital_raw` Kafka message that carries TLE data, keeping the table continuously up to date without requiring a separate ingestion path.

- **`usePassPredictions` React Hook** — Polls the pass API every 5 minutes with automatic AbortController cancellation on component unmount. Returns `{ passes, loading, error, refetch }` with fully-typed `PassResult[]` data.

- **Live Widget Wiring** — `OrbitalSidebarLeft` now uses the active mission area (via `getMissionArea()`) as the observer location and passes live data directly to `PassPredictorWidget`, `DopplerWidget`, and `PolarPlotWidget`.

---

## Technical Details

- **New dependencies**: `sgp4>=2.22`, `numpy>=1.26` added to `backend/api/requirements.txt`.
- **New files**: `backend/api/routers/orbital.py`, `backend/api/utils/sgp4_utils.py`, `frontend/src/hooks/usePassPredictions.ts`.
- **DB migration**: The `satellites` table is added via `backend/db/init.sql` (`CREATE TABLE IF NOT EXISTS`) — safe to re-run against an existing database.
- **No breaking changes** to existing API endpoints or frontend props.

---

## Upgrade Instructions

```bash
# Pull latest branch
git pull origin claude/orbital-pass-prediction-TwVVT

# Rebuild backend API image (new dependencies)
docker compose build backend-api

# Restart services
docker compose up -d

# Reinitialize DB schema if running fresh (satellites table will be created)
# docker compose exec db psql -U postgres -d sovereignwatch -f /docker-entrypoint-initdb.d/init.sql
```
