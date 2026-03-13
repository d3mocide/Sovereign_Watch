-- Migration: Options C+D — Orbital storage optimisation
-- Option C: TLE strings are no longer stored on every position row.
--           They live exclusively in `satellites` (already true for that table).
--           Rows in `orbital_tracks` carry only position/kinematic columns.
-- Option D: Orbital positions are 100% mathematically reproducible from TLE.
--           A dedicated `orbital_tracks` hypertable is created with a 12-hour
--           retention policy instead of the longer general-tracks window.
--           Chunk interval is 6 h so the retention job always drops whole chunks.
--
-- Apply with:
--   psql -d sovereign_watch -f migrate_orbital_tracks_cd.sql
--
-- Safe to run multiple times (all statements are idempotent).

-- -------------------------------------------------------------------------
-- 1. Create the orbital_tracks hypertable
-- -------------------------------------------------------------------------
-- Intentionally omits:
--   • meta JSONB   — all orbital metadata lives in `satellites`
--   • type TEXT    — always "a-s-K" for satellites; no need to store per-row
-- Row size target: ~160 bytes (down from ~600 bytes in the shared tracks table)

CREATE TABLE IF NOT EXISTS orbital_tracks (
    time        TIMESTAMPTZ      NOT NULL,
    entity_id   TEXT             NOT NULL,   -- "SAT-{norad_id}"
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION,
    alt         DOUBLE PRECISION,
    speed       DOUBLE PRECISION,
    heading     DOUBLE PRECISION,
    geom        GEOMETRY(POINT, 4326)
);

SELECT create_hypertable(
    'orbital_tracks',
    'time',
    if_not_exists       => TRUE,
    chunk_time_interval => INTERVAL '6 hours'   -- 2 live chunks inside 12 h window
);

-- -------------------------------------------------------------------------
-- 2. Compression
-- -------------------------------------------------------------------------
ALTER TABLE orbital_tracks SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'entity_id',
    timescaledb.compress_orderby   = 'time DESC'
);

-- Compress chunks that are older than 2 hours (keeps the active write window
-- uncompressed for fast bulk inserts from the propagation loop).
SELECT add_compression_policy('orbital_tracks', INTERVAL '2 hours', if_not_exists => TRUE);

-- -------------------------------------------------------------------------
-- 3. Retention — 12 hours
-- -------------------------------------------------------------------------
-- Orbital positions are deterministic; no reason to hold them longer.
-- The retention job runs hourly and drops complete 6-hour chunks.
SELECT add_retention_policy('orbital_tracks', INTERVAL '12 hours', if_not_exists => TRUE);

-- -------------------------------------------------------------------------
-- 4. Indices
-- -------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_orbital_tracks_entity_time
    ON orbital_tracks (entity_id, time DESC);

CREATE INDEX IF NOT EXISTS ix_orbital_tracks_geom
    ON orbital_tracks USING GIST (geom);

-- Trigram index mirrors the one on tracks so the /search endpoint can use
-- the same ILIKE pattern against entity_id on both tables.
CREATE INDEX IF NOT EXISTS ix_orbital_tracks_entity_id_trgm
    ON orbital_tracks USING gin (entity_id gin_trgm_ops);
