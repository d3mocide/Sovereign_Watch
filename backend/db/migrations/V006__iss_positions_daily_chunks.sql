-- V006 — iss_positions: 1-hour chunks → 1-day chunks
--
-- At the ISS poller's 5-second cadence a 1-hour chunk holds only ~720 rows
-- (~73 kB). Compressing chunks that small makes them BIGGER (the server logs
-- "poor compression ratio detected ... 0.75" on every run) and the
-- compression job churns through these micro-chunks continuously. Daily
-- chunks (~17k rows) compress properly and cut the background-job overhead.
--
-- Existing 1-hour chunks are left as-is; the 7-day retention policy clears
-- them out within a week. Only newly created chunks use the daily interval.

SELECT set_chunk_time_interval('iss_positions', INTERVAL '1 day');

-- Reschedule compression to match the new chunk size: compress after 1 day
-- instead of 1 hour (also moves the job's schedule interval from every
-- 30 minutes to every 12 hours).
SELECT remove_compression_policy('iss_positions', if_exists => true);
SELECT add_compression_policy('iss_positions', INTERVAL '1 day',
    if_not_exists => true);
