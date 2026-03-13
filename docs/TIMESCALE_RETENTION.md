# TimescaleDB Data Retention

## Overview

Sovereign Watch uses **two separate hypertables** for time-series track data, each
with its own retention and compression policy tuned to the nature of the data it
holds:

| Hypertable | Data | Chunk interval | Compression after | Retention |
|---|---|---|---|---|
| `tracks` | AIS vessels, ADS-B aircraft | 1 day | **1 hour** | **72 hours** |
| `orbital_tracks` | Satellite positions | 6 hours | **2 hours** | **12 hours** |

The `satellites` table (TLE catalogue) is a plain lookup table — no retention,
no compression, upserted by the Historian every 6 hours.

### Why two tables?

Orbital positions are 100% mathematically reproducible from TLE data via SGP4.
Holding them for 72 hours the same as an AIS track (which cannot be reproduced
after the fact) would waste ~6× the storage for no operational benefit.
The shorter window also keeps `orbital_tracks` lean enough to stay largely
in-cache.

### Why compress so early?

The old policy compressed at the retention boundary — data was compressed right
before being dropped, so it was never meaningfully compressed while live.
Moving the trigger to 1 h / 2 h means the bulk of each table's retained window
sits in columnar-compressed form (~42× ratio typical for TimescaleDB), keeping
storage well within bounds despite the extended 72-hour window for `tracks`.

---

## Hypertable Policies

### `tracks` (AIS + ADS-B)

```sql
-- 1-day chunks; 3 chunks retained inside the 72-hour window
SELECT create_hypertable('tracks', 'time', chunk_time_interval => INTERVAL '1 day');

-- Compress after 1 hour — ~71 of the 72 retained hours sit compressed
SELECT add_compression_policy('tracks', INTERVAL '1 hour');

-- Drop chunks older than 72 hours (matches TRACK_HISTORY_MAX_HOURS in config)
SELECT add_retention_policy('tracks', INTERVAL '72 hours');
```

### `orbital_tracks` (Satellite positions)

```sql
-- 6-hour chunks; 2 chunks retained inside the 12-hour window
SELECT create_hypertable('orbital_tracks', 'time', chunk_time_interval => INTERVAL '6 hours');

-- Compress after 2 hours
SELECT add_compression_policy('orbital_tracks', INTERVAL '2 hours');

-- Drop chunks older than 12 hours
SELECT add_retention_policy('orbital_tracks', INTERVAL '12 hours');
```

---

## Applying to an Existing Deployment

Two idempotent migration scripts are provided. Apply them in order:

```bash
# 1. Create orbital_tracks (Options C+D — strips TLE from track rows,
#    adds the dedicated satellite-position hypertable)
psql -d sovereign_watch -f backend/db/migrate_orbital_tracks_cd.sql

# 2. Extend AIS/ADS-B retention to 72 h and tighten compression trigger
psql -d sovereign_watch -f backend/db/migrate_tracks_72h_retention.sql

# Then restart the API / Historian containers so they route orbital_raw
# messages to orbital_tracks instead of tracks.
docker compose restart backend-api
```

Or run both interactively:

```bash
docker exec -it sovereign-timescaledb psql -U postgres -d sovereign_watch
```

```sql
-- tracks: 72 h retention, 1 h compression
SELECT remove_compression_policy('tracks', if_exists => TRUE);
SELECT add_compression_policy('tracks', INTERVAL '1 hour', if_not_exists => TRUE);
SELECT remove_retention_policy('tracks', if_exists => TRUE);
SELECT add_retention_policy('tracks', INTERVAL '72 hours', if_not_exists => TRUE);

-- orbital_tracks: create if it doesn't exist (see migration file for full DDL)
-- then 12 h retention, 2 h compression (already set by the migration)
```

---

## Verify Policy Status

```bash
docker exec -it sovereign-timescaledb psql -U postgres -d sovereign_watch
```

```sql
-- All active retention and compression jobs
SELECT
    j.job_id,
    j.proc_name,
    j.schedule_interval,
    j.config,
    s.last_run_status,
    s.last_run_duration,
    s.next_start
FROM timescaledb_information.jobs j
LEFT JOIN timescaledb_information.job_stats s USING (job_id)
WHERE j.proc_name IN ('policy_retention', 'policy_compression')
ORDER BY j.proc_name, j.config->>'hypertable_name';
```

Expected output (one row per policy per table):

| proc_name | config hypertable_name | schedule_interval |
|---|---|---|
| policy_compression | orbital_tracks | 00:30:00 |
| policy_compression | tracks | 00:30:00 |
| policy_retention | orbital_tracks | 01:00:00 |
| policy_retention | tracks | 01:00:00 |

---

## Manual Cleanup

Force-drop old chunks immediately (useful after testing or before a demo):

```sql
-- AIS/ADS-B: drop anything older than 72 hours
SELECT drop_chunks('tracks', INTERVAL '72 hours');

-- Orbital: drop anything older than 12 hours
SELECT drop_chunks('orbital_tracks', INTERVAL '12 hours');
```

Or from the host:

```bash
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch \
  -c "SELECT drop_chunks('tracks', INTERVAL '72 hours'); \
      SELECT drop_chunks('orbital_tracks', INTERVAL '12 hours');"
```

---

## Storage Monitoring

### Overall database size

```bash
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch -c \
  "SELECT pg_size_pretty(pg_database_size('sovereign_watch'));"
```

### Per-hypertable size (uncompressed vs compressed)

```sql
SELECT
    hypertable_name,
    pg_size_pretty(before_compression_total_bytes) AS uncompressed,
    pg_size_pretty(after_compression_total_bytes)  AS compressed,
    ROUND(
        before_compression_total_bytes::numeric
        / NULLIF(after_compression_total_bytes, 0), 1
    ) AS ratio
FROM timescaledb_information.compressed_hypertable_stats
ORDER BY hypertable_name;
```

### Chunk inventory (both tables)

```sql
SELECT
    hypertable_name,
    chunk_name,
    range_start,
    range_end,
    compression_status,
    pg_size_pretty(total_bytes) AS chunk_size
FROM timescaledb_information.chunks
WHERE hypertable_name IN ('tracks', 'orbital_tracks')
ORDER BY hypertable_name, range_start DESC;
```

### Compression detail per chunk

```sql
SELECT
    c.hypertable_name,
    c.chunk_name,
    c.range_start,
    pg_size_pretty(cs.before_compression_total_bytes) AS before,
    pg_size_pretty(cs.after_compression_total_bytes)  AS after
FROM timescaledb_information.chunks c
JOIN timescaledb_information.compressed_chunk_stats cs
    ON cs.chunk_name = c.chunk_name
WHERE c.hypertable_name IN ('tracks', 'orbital_tracks')
ORDER BY c.hypertable_name, c.range_start DESC;
```

---

## Troubleshooting

### Database growing too large?

1. **Confirm both policies are active and scheduled**:

   ```sql
   SELECT job_id, proc_name, config->>'hypertable_name' AS table,
          scheduled, last_run_status
   FROM timescaledb_information.jobs
   LEFT JOIN timescaledb_information.job_stats USING (job_id)
   WHERE proc_name IN ('policy_retention', 'policy_compression');
   ```

2. **Check when each policy last ran**:

   ```sql
   SELECT job_id, last_run_status, last_run_duration, next_start
   FROM timescaledb_information.job_stats
   WHERE job_id IN (
       SELECT job_id FROM timescaledb_information.jobs
       WHERE proc_name IN ('policy_retention', 'policy_compression')
   );
   ```

3. **Manually trigger a specific policy**:

   ```sql
   -- Find job_ids first, then run:
   CALL run_job(<job_id>);
   ```

4. **Force immediate drop**:

   ```sql
   SELECT drop_chunks('tracks', INTERVAL '72 hours');
   SELECT drop_chunks('orbital_tracks', INTERVAL '12 hours');
   ```

### Compressed chunks not being dropped?

TimescaleDB automatically decompresses chunks before dropping them when the
retention policy fires — this is handled transparently. If you are manually
calling `drop_chunks` and hitting errors, decompress first:

```sql
SELECT decompress_chunk(c.chunk_schema || '.' || c.chunk_name)
FROM timescaledb_information.chunks c
WHERE c.hypertable_name = 'tracks'
  AND c.range_end < NOW() - INTERVAL '72 hours'
  AND c.compression_status = 'Compressed';
```

### Replay missing satellite data beyond 12 hours?

The `/api/tracks/replay` endpoint UNIONs both `tracks` and `orbital_tracks`.
Orbital positions older than 12 hours are dropped by design — they are fully
reproducible via the `/api/orbital/groundtrack/{norad_id}` endpoint using the
current TLE from the `satellites` table.

---

## Best Practices

| Environment | `tracks` retention | `orbital_tracks` retention | Notes |
|---|---|---|---|
| Development | 6–12 h | 1–2 h | Keep Docker volumes small |
| Staging | 24 h | 6 h | Representative of prod load |
| Production | **72 h** | **12 h** | Default; matches API config |
| Long-term analysis | — | — | Export to S3/Parquet before drop |

---

## Quick Reference

```bash
# Current database size
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch \
  -c "SELECT pg_size_pretty(pg_database_size('sovereign_watch'));"

# Active retention + compression jobs (both tables)
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch \
  -c "SELECT proc_name, config->>'hypertable_name' AS table, schedule_interval \
      FROM timescaledb_information.jobs \
      WHERE proc_name IN ('policy_retention','policy_compression') \
      ORDER BY proc_name, table;"

# Force immediate cleanup
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch \
  -c "SELECT drop_chunks('tracks', INTERVAL '72 hours'); \
      SELECT drop_chunks('orbital_tracks', INTERVAL '12 hours');"

# Check Docker volume size
docker system df -v | grep postgres
```

---

## Related Files

| File | Purpose |
|---|---|
| `backend/db/init.sql` | Base schema for clean installs |
| `backend/db/migrate_orbital_tracks_cd.sql` | Creates `orbital_tracks` (Options C+D) |
| `backend/db/migrate_tracks_72h_retention.sql` | Extends `tracks` to 72 h retention |
| `backend/api/services/historian.py` | Routes orbital vs non-orbital writes |
| `backend/api/core/config.py` | `TRACK_HISTORY_MAX_HOURS`, `TRACK_REPLAY_MAX_HOURS` |

---

**Last updated**: 2026-03-13
**tracks retention**: 72 hours | **orbital_tracks retention**: 12 hours
