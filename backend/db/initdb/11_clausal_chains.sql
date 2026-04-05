-- =============================================================================
-- 11_clausal_chains.sql — Narrative telemetry and AI fusion substrate
-- =============================================================================
-- clausal_chains:          State-change events from TAK + GDELT (90-day)
-- hourly_clausal_summaries: Continuous aggregate for AI Router escalation
-- Triggers: updated_at maintenance + PostGIS geometry population
-- =============================================================================

CREATE TABLE IF NOT EXISTS clausal_chains (
    time                TIMESTAMPTZ  NOT NULL,
    uid                 TEXT         NOT NULL,
    source              VARCHAR      NOT NULL,  -- 'TAK_ADSB'|'TAK_AIS'|'GDELT'
    predicate_type      TEXT,                   -- TAK type code or GDELT CAMEO code
    locative_lat        DOUBLE PRECISION,
    locative_lon        DOUBLE PRECISION,
    locative_hae        DOUBLE PRECISION,       -- height above ellipsoid (m)
    state_change_reason VARCHAR,                -- LOCATION_TRANSITION|TYPE_CHANGE|…
    adverbial_context   JSONB,                  -- speed, course, altitude, battery_pct, …
    narrative_summary   TEXT,                   -- filled by AI Router
    geom                GEOMETRY(POINT, 4326),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable('clausal_chains', 'time',
    if_not_exists      => TRUE,
    chunk_time_interval => INTERVAL '1 day');

ALTER TABLE clausal_chains SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'uid',
    timescaledb.compress_orderby   = 'time DESC'
);
SELECT add_compression_policy('clausal_chains', INTERVAL '7 days',
    if_not_exists => TRUE);
SELECT add_retention_policy('clausal_chains', INTERVAL '90 days',
    if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ix_clausal_chains_uid_time
    ON clausal_chains (uid, time DESC);
CREATE INDEX IF NOT EXISTS ix_clausal_chains_source_time
    ON clausal_chains (source, time DESC);
CREATE INDEX IF NOT EXISTS ix_clausal_chains_geom
    ON clausal_chains USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_clausal_chains_narrative_tsvector
    ON clausal_chains USING GIN (to_tsvector('english', COALESCE(narrative_summary, '')));
CREATE INDEX IF NOT EXISTS ix_clausal_chains_adverbial
    ON clausal_chains USING GIN (adverbial_context);

-- CONTINUOUS AGGREGATE: hourly_clausal_summaries
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_clausal_summaries
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time)                                     AS hour,
    uid,
    source,
    COUNT(*)                                                         AS state_change_count,
    array_agg(DISTINCT predicate_type)                              AS predicate_types,
    first(locative_lat, time)                                       AS start_lat,
    first(locative_lon, time)                                       AS start_lon,
    last(locative_lat, time)                                        AS end_lat,
    last(locative_lon, time)                                        AS end_lon,
    MAX((adverbial_context->>'confidence')::FLOAT)                  AS max_confidence,
    array_agg(DISTINCT state_change_reason)                         AS state_change_reasons,
    array_agg(DISTINCT (adverbial_context->>'speed')::FLOAT)        AS speeds,
    array_agg(DISTINCT (adverbial_context->>'battery_pct')::FLOAT)  AS battery_levels
FROM clausal_chains
GROUP BY hour, uid, source
WITH NO DATA;

SELECT add_continuous_aggregate_policy('hourly_clausal_summaries',
    start_offset      => INTERVAL '30 days',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists     => TRUE);

-- TRIGGER: updated_at
CREATE OR REPLACE FUNCTION update_clausal_chains_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clausal_chains_updated_at'
    ) THEN
        CREATE TRIGGER trg_clausal_chains_updated_at
            BEFORE UPDATE ON clausal_chains
            FOR EACH ROW EXECUTE FUNCTION update_clausal_chains_updated_at();
    END IF;
END;
$$;

-- TRIGGER: auto-populate PostGIS geometry from lat/lon
CREATE OR REPLACE FUNCTION update_clausal_chains_geom()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.locative_lat IS NOT NULL AND NEW.locative_lon IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.locative_lon, NEW.locative_lat), 4326);
    END IF;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clausal_chains_geom'
    ) THEN
        CREATE TRIGGER trg_clausal_chains_geom
            BEFORE INSERT OR UPDATE ON clausal_chains
            FOR EACH ROW EXECUTE FUNCTION update_clausal_chains_geom();
    END IF;
END;
$$;
