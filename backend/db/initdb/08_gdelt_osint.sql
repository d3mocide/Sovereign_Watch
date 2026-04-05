-- =============================================================================
-- 08_gdelt_osint.sql — Geopolitical OSINT events + H3 risk heat-map
-- =============================================================================
-- gdelt_events:    GDELT CSV ingestion (7-day, 1-day compressed chunks)
-- h3_risk_scores:  Per-resolution H3 composite risk snapshots (24-hour)
-- =============================================================================

-- TABLE: gdelt_events (hypertable)
CREATE TABLE IF NOT EXISTS gdelt_events (
    time             TIMESTAMPTZ      NOT NULL,
    event_id         TEXT             NOT NULL,
    actor1           TEXT,
    actor2           TEXT,
    headline         TEXT,
    url              TEXT,
    goldstein        FLOAT,
    tone             FLOAT,
    lat              DOUBLE PRECISION NOT NULL,
    lon              DOUBLE PRECISION NOT NULL,
    geom             GEOMETRY(POINT, 4326),
    actor1_country   TEXT,
    actor2_country   TEXT,
    event_code       TEXT,
    event_root_code  TEXT,
    quad_class       SMALLINT,
    num_mentions     INT,
    num_sources      INT,
    num_articles     INT,
    event_date       DATE,
    UNIQUE (event_id, time)
);

-- Idempotent column additions for deployments predating enriched schema.
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS actor1_country   TEXT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS actor2_country   TEXT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS event_code       TEXT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS event_root_code  TEXT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS quad_class       SMALLINT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS num_mentions     INT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS num_sources      INT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS num_articles     INT;
ALTER TABLE gdelt_events ADD COLUMN IF NOT EXISTS event_date       DATE;

SELECT create_hypertable('gdelt_events', 'time',
    if_not_exists      => TRUE,
    chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('gdelt_events', INTERVAL '7 days');

ALTER TABLE gdelt_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'event_id'
);
SELECT add_compression_policy('gdelt_events', INTERVAL '1 day');

CREATE INDEX IF NOT EXISTS ix_gdelt_geom ON gdelt_events USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_gdelt_time ON gdelt_events (time DESC);
CREATE INDEX IF NOT EXISTS ix_gdelt_tone ON gdelt_events (tone);

-- TABLE: h3_risk_scores (hypertable)
-- 1-hour chunks; 24-hour retention matches the default lookback window.
CREATE TABLE IF NOT EXISTS h3_risk_scores (
    time          TIMESTAMPTZ      NOT NULL,
    h3_index      TEXT             NOT NULL,
    resolution    SMALLINT         NOT NULL,
    density_raw   FLOAT            NOT NULL,
    sentiment_raw FLOAT            NOT NULL,
    risk_score    FLOAT            NOT NULL,
    lat           DOUBLE PRECISION NOT NULL,
    lon           DOUBLE PRECISION NOT NULL
);

SELECT create_hypertable('h3_risk_scores', 'time',
    if_not_exists      => TRUE,
    chunk_time_interval => INTERVAL '1 hour');
SELECT add_retention_policy('h3_risk_scores', INTERVAL '24 hours');

CREATE INDEX IF NOT EXISTS ix_h3risk_index_res
    ON h3_risk_scores (h3_index, resolution, time DESC);
