-- =============================================================================
-- 10_users_auth.sql — Operator accounts and authentication
-- =============================================================================
-- Roles: viewer (read-only) | operator (read+write) | admin (full access)
-- password_version is embedded as 'pwv' in JWTs so password changes
-- immediately invalidate all previously issued tokens.
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id               SERIAL      PRIMARY KEY,
    username         TEXT        NOT NULL UNIQUE,
    hashed_password  TEXT        NOT NULL,
    role             TEXT        NOT NULL DEFAULT 'viewer'
                         CHECK (role IN ('viewer', 'operator', 'admin')),
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    password_version INT         NOT NULL DEFAULT 0
);

-- Idempotent addition for deployments predating password_version column.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_version INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);

-- FUNCTION + TRIGGER: keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at'
    ) THEN
        CREATE TRIGGER trg_users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_users_updated_at();
    END IF;
END;
$$;
