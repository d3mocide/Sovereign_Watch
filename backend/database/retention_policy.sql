-- TimescaleDB Data Retention Policy
-- Auto-delete track data older than 24 hours

-- Enable data retention on the tracks hypertable
-- This creates a background job that runs every hour and drops chunks older than 24 hours

SELECT add_retention_policy('tracks', INTERVAL '24 hours');

-- Verify the policy
SELECT * FROM timescaledb_information.jobs
WHERE proc_name = 'policy_retention';

-- Optional: Manually drop old chunks immediately (run once for maintenance)
-- SELECT drop_chunks('tracks', INTERVAL '24 hours');
