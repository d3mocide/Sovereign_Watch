-- Migration: V003__airspace_zones.sql
-- OpenAIP global restricted/danger/prohibited airspace zones
-- Source: api.core.openaip.net (free API, global coverage, no .gov required)

CREATE TABLE IF NOT EXISTS airspace_zones (
    time         TIMESTAMPTZ      NOT NULL,   -- ingestion timestamp
    zone_id      TEXT             NOT NULL,   -- OpenAIP _id
    name         TEXT,
    type         TEXT             NOT NULL,   -- RESTRICTED, DANGER, PROHIBITED, WARNING, etc.
    icao_class   TEXT,                        -- A–G, UNCLASSIFIED
    country      TEXT,                        -- ISO 3166-1 alpha-2
    upper_limit  TEXT,                        -- e.g. "FL 100", "18000 FT MSL"
    lower_limit  TEXT,                        -- e.g. "GND", "500 FT AGL"
    geometry_json TEXT            NOT NULL    -- GeoJSON Polygon as JSON string
);

SELECT create_hypertable(
    'airspace_zones', 'time',
    if_not_exists       => TRUE,
    chunk_time_interval => INTERVAL '24 hours'
);

-- Airspace is relatively static — 30-day retention is ample for audit
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM timescaledb_information.jobs j
        WHERE j.hypertable_name = 'airspace_zones'
          AND j.proc_name       = 'policy_retention'
    ) THEN
        PERFORM add_retention_policy('airspace_zones', INTERVAL '30 days');
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ix_airspace_zone_id ON airspace_zones (zone_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_airspace_type    ON airspace_zones (type, time DESC);
CREATE INDEX IF NOT EXISTS ix_airspace_country ON airspace_zones (country, time DESC);
