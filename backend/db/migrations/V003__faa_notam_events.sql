-- Migration: V003__faa_notam_events.sql
-- FAA NOTAM (Notice to Air Missions) — persistent event store + active cache support

CREATE TABLE IF NOT EXISTS notam_events (
    time            TIMESTAMPTZ NOT NULL,
    notam_id        TEXT        NOT NULL,
    icao_id         TEXT,
    feature_name    TEXT,
    classification  TEXT,       -- DOM, INTL, FDC, LMNS, MIL, SUASE
    keyword         TEXT,       -- OBST, AIRSPACE, RWY, TWY, SVC, NAV, COM, etc.
    effective_start TIMESTAMPTZ,
    effective_end   TIMESTAMPTZ,
    lat             DOUBLE PRECISION,
    lon             DOUBLE PRECISION,
    radius_nm       DOUBLE PRECISION,
    min_alt_ft      INTEGER,
    max_alt_ft      INTEGER,
    raw_text        TEXT,
    geom_type       TEXT        -- POINT, POLYGON, CIRCLE (derived geometry type)
);

SELECT create_hypertable(
    'notam_events', 'time',
    if_not_exists       => TRUE,
    chunk_time_interval => INTERVAL '6 hours'
);

-- Retention: keep 7 days (NOTAMs are time-bounded; expired ones stay for audit)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM timescaledb_information.jobs j
        WHERE j.hypertable_name = 'notam_events'
          AND j.proc_name       = 'policy_retention'
    ) THEN
        PERFORM add_retention_policy('notam_events', INTERVAL '7 days');
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ix_notam_notam_id ON notam_events (notam_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_notam_icao     ON notam_events (icao_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_notam_keyword  ON notam_events (keyword, time DESC);
