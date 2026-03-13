-- Migration: Extend AIS/ADS-B track retention to 72 hours
--
-- Context
-- -------
-- The API already accepts history requests up to 72 h (TRACK_HISTORY_MAX_HOURS=72)
-- and replay requests up to 168 h (TRACK_REPLAY_MAX_HOURS=168).  The DB retention
-- was previously set to 24 h, so requests beyond that window silently returned
-- no data.  This migration aligns the DB with the API's intended capability.
--
-- Compression note
-- ----------------
-- Previously the compression policy was set to 24 h — data was compressed right
-- at the edge of the retention window, effectively meaning it was never usefully
-- compressed before being dropped.  The new policy compresses after 1 h so that
-- ~71 of the 72 retained hours sit in columnar-compressed form.
-- At ~600 bytes/row (uncompressed) and ~14 bytes/row (compressed, ~42x ratio
-- typical for TimescaleDB columnar storage), the 71-hour compressed portion is
-- materially cheaper than the old 24-hour uncompressed window was.
--
-- Chunk interval
-- --------------
-- 1-day chunks are kept unchanged.  With 72 h retention the retention job will
-- hold 3 full-day chunks and drop the oldest, which is clean and low-overhead.
--
-- Apply with:
--   psql -d sovereign_watch -f migrate_tracks_72h_retention.sql
--
-- Safe to run multiple times (remove_ functions accept if_exists => TRUE).

-- 1. Compression: compress after 1 hour instead of 24 hours
SELECT remove_compression_policy('tracks', if_exists => TRUE);
SELECT add_compression_policy('tracks', INTERVAL '1 hour', if_not_exists => TRUE);

-- 2. Retention: keep 72 hours instead of 24 hours
SELECT remove_retention_policy('tracks', if_exists => TRUE);
SELECT add_retention_policy('tracks', INTERVAL '72 hours', if_not_exists => TRUE);
