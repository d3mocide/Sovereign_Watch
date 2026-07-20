# Release - v1.1.3 - TimescaleDB Tuning, Clausal Intelligence & Orbital Optimization

Sovereign Watch v1.1.3 resolves critical database performance thrash, repairs multi-INT correlation legs in the clausal-chain risk scoring pipeline, activates LiteLLM Router provider fallbacks, updates domain agent heuristics with real multi-INT telemetry, and vectorizes topocentric pass prediction calculations.

---

## High-Level Summary

This release fixes a severe database resource spike caused by a type mismatch in SatNOGS satellite enrichment queries (`text[]` vs `int[]`) and TimescaleDB micro-chunk compression overhead on `iss_positions`. Hypertable chunking has been adjusted via migration `V006` to 1-day intervals alongside custom Postgres shared buffer and checkpoint tuning in Docker Compose. The TAK clausalizer and escalation engines now correctly integrate IODA outages, SatNOGS signal anomalies, and CAMEO root-code sequence matching without dropping non-positional state events (squawk, altitude, battery) to jitter filters. Additionally, orbital pass predictions have been fully vectorized using NumPy, and LiteLLM Router fallbacks have been enabled for high-availability AI analysis.

## Key Changes

- **Database Optimization & TimescaleDB Stability**:
  - Added migration `V006` to resize `iss_positions` hypertable chunk intervals from 1 hour (~720 rows) to 1 day (~17k rows), eliminating micro-chunk compression thrash.
  - Sized Postgres `shared_buffers` (2GB), `checkpoint_timeout` (15m), and `max_wal_size` (4GB) in `docker-compose.yml` for stable performance on standard host hardware.
  - Fixed a type mismatch bug comparing `satellites.norad_id` as `int[]` against `text` in SatNOGS enrichment queries.
- **Clausal Chain & Multi-INT Correlation Pipeline**:
  - Restored missing multi-INT feed persistence for IODA outage snapshots (`infra_poller`) and SatNOGS signal degradation events (`space_pulse`).
  - Aligned GDELT escalation pattern matching with CAMEO root-code sequences evaluated chronologically.
  - Evaluated non-positional entity state transitions (squawk, altitude, battery) prior to location jitter filtering.
  - Clamped LLM score revisions to ±0.25 of heuristic baselines to enforce monotonic evidence risk composition.
- **Domain Agent Heuristics & AI Service Fallbacks**:
  - Replaced raw entity-count proxy heuristics with real multi-INT telemetry (FIRMS thermal x AIS dark vessel cross-referencing and active Redis holding-pattern zones).
  - Activated LiteLLM Router fallbacks for transient provider failures and added a consumer for `hourly_clausal_summaries`.
- **Orbital Pass Prediction & Container Upgrades**:
  - Vectorized `ecef_to_topocentric_vectorized()` coordinate conversions and Julian date calculations in pass predictions.
  - Updated `JS8Call-improved` AppImage binary to v3.0.3 in the `sovereign-js8call` container build.

## Technical Details

- **Database Migrations**: `V006__iss_positions_daily_chunks.sql` (automatic migration on startup).
- **Dependencies**: Aligned `asyncpg` dependency to `0.31.0` in `backend/ingestion/tak_clausalizer`.
- **Performance Impact**:
  - TimescaleDB background compression job churn and buffer cache thrash eliminated.
  - Orbital topocentric pass prediction calculations accelerated across large satellite pass windows.
  - Satellite enrichment query errors resolved.

## Upgrade & Deployment Instructions

To upgrade a local deployment to v1.1.3:

```bash
# 1. Pull the latest release changes
git fetch origin && git checkout main && git pull

# 2. Rebuild and restart container services
docker compose down
docker compose up -d --build
```
