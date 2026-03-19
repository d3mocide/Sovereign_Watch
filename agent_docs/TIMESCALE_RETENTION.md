# TimescaleDB Data Retention

## Overview

Sovereign Watch uses **one hypertable** for time-series track data, with the
`satellites` table serving as a permanent TLE catalogue:

| Table | Type | Data | Chunk interval | Compression after | Retention |
|---|---|---|---|---|---|
| `tracks` | Hypertable | AIS vessels, ADS-B aircraft | 1 day | **1 hour** | **72 hours** |
| `satellites` | Plain table | Satellite TLE catalogue | — | — | Permanent (upserted) |

### Why no orbital_tracks hypertable?

Satellite positions are **100% mathematically reproducible** from TLE data via
SGP4 at any historical timestamp.  Storing ~2 000 position rows per second
(~10 000 satellites × every 5 seconds) provided no operational benefit:

- The `/api/tracks/history/{SAT-*}` endpoint now propagates positions in-process
  from the stored TLE — with unlimited historical reach bounded only by TLE age.
- The `/api/tracks/search` endpoint computes current satellite positions on-demand
  via SGP4 when returning satellite search results.
- The `/api/orbital/groundtrack/{norad_id}` endpoint was already doing the same.

Removing the hypertable eliminates the highest-volume write path in the system
with zero loss of functionality.

### Why compress tracks so early?

The compression policy triggers at **1 hour**, so ~71 of the 72 retained hours
sit in columnar-compressed form (~42× ratio typical for TimescaleDB).  This
keeps storage well within bounds despite the 72-hour retention window.

---

## Hypertable Policies

### `tracks` (AIS + ADS-B)

```sql
-- 1-day chunks; 3 chunks retained inside the 72-hour window
SELECT create_hypertable('tracks', 'time', chunk_time_interval => INTERVAL '1 day');

-- Compress after 1 hour — ~71 of the 72 retained hours sit compressed
SELECT add_compression_policy('tracks', INTERVAL '1 hour', if_not_exists => TRUE);

-- Drop chunks older than 72 hours (matches TRACK_HISTORY_MAX_HOURS in config)
SELECT add_retention_policy('tracks', INTERVAL '72 hours', if_not_exists => TRUE);
```

---

## Applying to an Existing Deployment

### Fresh install

`backend/db/init.sql` is applied automatically on first container start.
`orbital_tracks` is not created.

### Migrating an existing deployment that has orbital_tracks

```bash
docker exec -it sovereign-timescaledb psql -U postgres -d sovereign_watch
```

```sql
-- Drop the now-unused hypertable (decompress first if needed)
SELECT decompress_chunk(c.chunk_schema || '.' || c.chunk_name)
FROM timescaledb_information.chunks c
WHERE c.hypertable_name = 'orbital_tracks'
  AND c.compression_status = 'Compressed';

DROP TABLE IF EXISTS orbital_tracks;
```

Then restart the API so the historian no longer tries to write to it:

```bash
docker compose restart backend-api
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
| policy_compression | tracks | 00:30:00 |
| policy_retention | tracks | 01:00:00 |

---

## Manual Cleanup

Force-drop old chunks immediately (useful after testing or before a demo):

```sql
-- AIS/ADS-B: drop anything older than 72 hours
SELECT drop_chunks('tracks', INTERVAL '72 hours');
```

Or from the host:

```bash
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch \
  -c "SELECT drop_chunks('tracks', INTERVAL '72 hours');"
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

### Chunk inventory

```sql
SELECT
    hypertable_name,
    chunk_name,
    range_start,
    range_end,
    compression_status,
    pg_size_pretty(total_bytes) AS chunk_size
FROM timescaledb_information.chunks
WHERE hypertable_name = 'tracks'
ORDER BY range_start DESC;
```

---

## Troubleshooting

### Database growing too large?

1. **Confirm policy is active and scheduled**:

   ```sql
   SELECT job_id, proc_name, config->>'hypertable_name' AS table,
          scheduled, last_run_status
   FROM timescaledb_information.jobs
   LEFT JOIN timescaledb_information.job_stats USING (job_id)
   WHERE proc_name IN ('policy_retention', 'policy_compression');
   ```

2. **Force immediate drop**:

   ```sql
   SELECT drop_chunks('tracks', INTERVAL '72 hours');
   ```

### Compressed chunks not being dropped?

TimescaleDB automatically decompresses chunks before dropping them when the
retention policy fires — this is handled transparently.  If you are manually
calling `drop_chunks` and hitting errors, decompress first:

```sql
SELECT decompress_chunk(c.chunk_schema || '.' || c.chunk_name)
FROM timescaledb_information.chunks c
WHERE c.hypertable_name = 'tracks'
  AND c.range_end < NOW() - INTERVAL '72 hours'
  AND c.compression_status = 'Compressed';
```

---

## Best Practices

| Environment | `tracks` retention | Notes |
|---|---|---|
| Development | 6–12 h | Keep Docker volumes small |
| Staging | 24 h | Representative of prod load |
| Production | **72 h** | Default; matches API config |
| Long-term analysis | — | Export to S3/Parquet before drop |

---

## Quick Reference

```bash
# Current database size
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch \
  -c "SELECT pg_size_pretty(pg_database_size('sovereign_watch'));"

# Active retention + compression jobs
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch \
  -c "SELECT proc_name, config->>'hypertable_name' AS table, schedule_interval \
      FROM timescaledb_information.jobs \
      WHERE proc_name IN ('policy_retention','policy_compression') \
      ORDER BY proc_name, table;"

# Force immediate cleanup
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch \
  -c "SELECT drop_chunks('tracks', INTERVAL '72 hours');"

# Check Docker volume size
docker system df -v | grep postgres
```

---

## Related Files

| File | Purpose |
|---|---|
| `backend/db/init.sql` | Base schema for clean installs |
| `backend/api/services/historian.py` | Writes ADS-B/AIS to `tracks`; upserts TLEs to `satellites` |
| `backend/api/routers/tracks.py` | History/search use SGP4 for SAT-* entities |
| `backend/api/routers/orbital.py` | Pass prediction, groundtrack, stats (all use `satellites`) |
| `backend/api/core/config.py` | `TRACK_HISTORY_MAX_HOURS`, `TRACK_REPLAY_MAX_HOURS` |

---

**Last updated**: 2026-03-17
**tracks retention**: 72 hours | **orbital_tracks**: removed — positions computed on-demand via SGP4
