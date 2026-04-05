-- =============================================================================
-- 02_telemetry.sql — Core live-feed telemetry (tracks hypertable)
-- =============================================================================
-- High-velocity table: ADS-B, AIS, and TAK position reports.
-- Partitioned by day; 4-hour compression lag; 7-day retention.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tracks (
    time        TIMESTAMPTZ NOT NULL,
    entity_id   TEXT        NOT NULL,
    type        TEXT,
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION,
    alt         DOUBLE PRECISION,
    speed       DOUBLE PRECISION,
    heading     DOUBLE PRECISION,
    meta        JSONB,
    geom        GEOMETRY(POINT, 4326)
);

SELECT create_hypertable('tracks', 'time',
    if_not_exists      => TRUE,
    chunk_time_interval => INTERVAL '1 day');

ALTER TABLE tracks SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'entity_id',
    timescaledb.compress_orderby   = 'time DESC'
);

-- Migrate existing compression policy from 1h → 4h if it was previously created.
-- On a fresh deployment this block is a no-op; on an upgrade it reschedules the job.
DO $$
DECLARE
    _job_id INTEGER;
BEGIN
    SELECT job_id INTO _job_id
    FROM timescaledb_information.jobs
    WHERE hypertable_name = 'tracks' AND proc_name = 'policy_compression';
    IF _job_id IS NOT NULL THEN
        PERFORM alter_job(_job_id, config => jsonb_build_object('compress_after', '4 hours'));
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL; -- alter_job not available on older TimescaleDB; set on first init.
END;
$$;

-- 4-hour lag: write-friendly uncompressed window; reduces I/O contention on
-- constrained hardware (Jetson Nano) vs the previous 1-hour setting.
SELECT add_compression_policy('tracks', INTERVAL '4 hours');

-- 7-day retention matches GDELT event window for multi-INT correlation.
SELECT add_retention_policy('tracks', INTERVAL '7 days');

CREATE INDEX IF NOT EXISTS ix_tracks_geom
    ON tracks USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_tracks_entity_time
    ON tracks (entity_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_tracks_entity_id_trgm
    ON tracks USING gin (entity_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_tracks_meta_callsign_trgm
    ON tracks USING gin ((meta->>'callsign') gin_trgm_ops);

-- NOTE: orbital_tracks was removed.
-- Satellite positions are deterministic and computed on-demand via SGP4 from
-- the TLEs stored in the `satellites` table.  Persisting ~2 000 rows/sec of
-- reproducible data provided no operational benefit.
-- /api/tracks/history/{SAT-*} and /api/orbital/groundtrack/{norad_id} propagate
-- positions in-process.
