-- Migration: Create RF infrastructure tables (rf_sites, rf_systems, rf_talkgroups)
-- Run this if the RF Plus overhaul tables are missing from an existing DB instance.

-- TABLE: rf_sites (All fixed RF infrastructure)
CREATE TABLE IF NOT EXISTS rf_sites (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source       TEXT NOT NULL,
    site_id      TEXT NOT NULL,
    service      TEXT NOT NULL,
    callsign     TEXT,
    name         TEXT,
    lat          DOUBLE PRECISION NOT NULL,
    lon          DOUBLE PRECISION NOT NULL,
    output_freq  DOUBLE PRECISION,
    input_freq   DOUBLE PRECISION,
    tone_ctcss   DOUBLE PRECISION,
    tone_dcs     TEXT,
    modes        TEXT[],
    use_access   TEXT,
    status       TEXT DEFAULT 'Unknown',
    city         TEXT,
    state        TEXT,
    country      TEXT DEFAULT 'US',
    emcomm_flags TEXT[],
    meta         JSONB,
    geom         GEOMETRY(POINT, 4326),
    fetched_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (source, site_id)
);

CREATE INDEX IF NOT EXISTS ix_rf_sites_geom       ON rf_sites USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_rf_sites_service     ON rf_sites (service);
CREATE INDEX IF NOT EXISTS ix_rf_sites_source      ON rf_sites (source);
CREATE INDEX IF NOT EXISTS ix_rf_sites_callsign    ON rf_sites USING gin (callsign gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_rf_sites_modes       ON rf_sites USING GIN (modes);
CREATE INDEX IF NOT EXISTS ix_rf_sites_emcomm      ON rf_sites USING GIN (emcomm_flags);

-- TABLE: rf_systems (Trunked public safety systems)
CREATE TABLE IF NOT EXISTS rf_systems (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source     TEXT DEFAULT 'radioref',
    rr_sid     TEXT UNIQUE,
    name       TEXT NOT NULL,
    type       TEXT,
    state      TEXT,
    county     TEXT,
    meta       JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_rf_systems_state ON rf_systems (state);

-- TABLE: rf_talkgroups (Trunked talkgroup catalogue)
CREATE TABLE IF NOT EXISTS rf_talkgroups (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    system_id   UUID REFERENCES rf_systems(id) ON DELETE CASCADE,
    decimal_id  INTEGER NOT NULL,
    alpha_tag   TEXT,
    description TEXT,
    category    TEXT,
    priority    INTEGER DEFAULT 3,
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (system_id, decimal_id)
);

CREATE INDEX IF NOT EXISTS ix_rf_talkgroups_system ON rf_talkgroups (system_id);
CREATE INDEX IF NOT EXISTS ix_rf_talkgroups_cat    ON rf_talkgroups (category);
