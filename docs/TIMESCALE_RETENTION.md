# TimescaleDB Data Retention

## Overview

Sovereign Watch's TimescaleDB is configured with **automatic data retention** to prevent unbounded storage growth. By default, track data older than **24 hours** is automatically deleted.

---

## Automatic Retention Policy

### How It Works:

- **Policy**: Runs every hour as a background job
- **Retention Window**: 24 hours (configurable)
- **Target**: `tracks` hypertable
- **Action**: Drops chunks (time partitions) outside the retention window

### Configuration:

Defined in `backend/db/init.sql`:

```sql
SELECT add_retention_policy('tracks', INTERVAL '24 hours');
```

### Verify Policy Status:

```bash
# Connect to database
docker exec -it sovereign-timescaledb psql -U postgres -d sovereign_watch

# Check retention policy
SELECT * FROM timescaledb_information.jobs
WHERE proc_name = 'policy_retention';
```

---

## Manual Cleanup

For immediate cleanup (e.g., after testing or before deployment):

### Option 1: Python Script

```bash
# From host machine
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch -c "SELECT drop_chunks('tracks', INTERVAL '24 hours');"

# Or use the Python script
docker exec sovereign-backend python /app/scripts/cleanup_timescale.py
```

### Option 2: SQL Query

```bash
docker exec -it sovereign-timescaledb psql -U postgres -d sovereign_watch
```

```sql
-- Drop chunks older than 24 hours
SELECT drop_chunks('tracks', INTERVAL '24 hours');

-- Check database size
SELECT pg_size_pretty(pg_database_size('sovereign_watch'));

-- Check chunk count
SELECT COUNT(*) FROM timescaledb_information.chunks
WHERE hypertable_name = 'tracks';
```

---

## Modify Retention Period

To change the retention window (e.g., to 12 hours or 7 days):

### Option 1: Update init.sql (New Deployments)

Edit `backend/db/init.sql`:

```sql
-- Change to 12 hours
SELECT add_retention_policy('tracks', INTERVAL '12 hours');

-- Or 7 days
SELECT add_retention_policy('tracks', INTERVAL '7 days');
```

### Option 2: Update Existing Database

```bash
docker exec -it sovereign-timescaledb psql -U postgres -d sovereign_watch
```

```sql
-- Remove old policy
SELECT remove_retention_policy('tracks');

-- Add new policy
SELECT add_retention_policy('tracks', INTERVAL '12 hours');
```

---

## Storage Monitoring

### Check Database Size:

```bash
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch -c \
  "SELECT pg_size_pretty(pg_database_size('sovereign_watch'));"
```

### Check Chunk Information:

```sql
SELECT
    chunk_schema,
    chunk_name,
    range_start,
    range_end,
    pg_size_pretty(total_bytes) as chunk_size
FROM timescaledb_information.chunks
WHERE hypertable_name = 'tracks'
ORDER BY range_start DESC;
```

### Check Compression Status:

```sql
SELECT
    chunk_name,
    compression_status,
    before_compression_total_bytes,
    after_compression_total_bytes,
    pg_size_pretty(before_compression_total_bytes) as before_size,
    pg_size_pretty(after_compression_total_bytes) as after_size
FROM timescaledb_information.compressed_chunk_stats
ORDER BY chunk_name;
```

---

## Troubleshooting

### Database Growing Too Large?

1. **Verify retention policy is active**:

   ```sql
   SELECT * FROM timescaledb_information.jobs
   WHERE proc_name = 'policy_retention' AND scheduled = true;
   ```

2. **Check last run time**:

   ```sql
   SELECT * FROM timescaledb_information.job_stats
   WHERE job_id IN (
       SELECT job_id FROM timescaledb_information.jobs
       WHERE proc_name = 'policy_retention'
   );
   ```

3. **Manually trigger policy**:

   ```sql
   CALL run_job(<job_id>);  -- Use job_id from step 1
   ```

4. **Force immediate cleanup**:
   ```sql
   SELECT drop_chunks('tracks', INTERVAL '24 hours');
   ```

### No Data Being Deleted?

- Check if chunks are **compressed**. Compressed chunks aren't dropped until decompressed.
- Verify the `time` column has recent data (policy only drops old chunks).
- Ensure the policy interval is correct (24 hours = 1 day).

---

## Best Practices

1. **Development**: Use short retention (6-12 hours) to keep Docker volumes small
2. **Production**: Use 24-48 hours for operational monitoring
3. **Long-term Analysis**: Export historical data before it's dropped
4. **Testing**: Run manual cleanup before/after load tests

---

## Related Documentation

- [TimescaleDB Retention Policies](https://docs.timescale.com/use-timescale/latest/data-retention/)
- [TimescaleDB Compression](https://docs.timescale.com/use-timescale/latest/compression/)
- [Docker Volume Management](../docker-compose.yml)

---

## Quick Commands Reference

```bash
# Check current database size
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch -c "SELECT pg_size_pretty(pg_database_size('sovereign_watch'));"

# Drop old data immediately
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch -c "SELECT drop_chunks('tracks', INTERVAL '24 hours');"

# Verify retention policy
docker exec sovereign-timescaledb psql -U postgres -d sovereign_watch -c "SELECT * FROM timescaledb_information.jobs WHERE proc_name = 'policy_retention';"

# Check Docker volume size
docker system df -v | grep postgres
```

---

**Last Updated**: 2026-02-04  
**Retention Period**: 24 hours (default)
