-- Read-only top query report. Run after migrations and representative usage.
-- Timings and I/O are cumulative since the statistics reset; do not reset production stats.
SELECT queryid, calls, round(total_exec_time::numeric, 2) AS total_ms,
       round(mean_exec_time::numeric, 2) AS mean_ms, rows,
       pg_size_pretty(temp_blks_written * 8192) AS temp_written,
       shared_blks_read, shared_blks_hit, left(query, 240) AS normalized_query
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY total_exec_time DESC LIMIT 20;
