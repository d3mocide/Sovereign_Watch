-- Create sw_users table (Standard Postgres table, NOT a TimescaleDB hypertable)
CREATE TABLE IF NOT EXISTS sw_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    roles TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- Unique index on username
CREATE UNIQUE INDEX IF NOT EXISTS idx_sw_users_username ON sw_users(username);

-- Insert default admin user
-- NOTE: The password hash below is for 'admin' and MUST be replaced before deployment!
-- Password generation: python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['argon2'], argon2__memory_cost=65536, argon2__parallelism=1, argon2__time_cost=2).hash('admin'))"
INSERT INTO sw_users (username, password_hash, roles)
VALUES (
    'admin',
    '$argon2id$v=19$m=65536,t=2,p=1$QnI9/s/f+50O3LqE6V4f2Q$U6u1pI+x3H/Yy5P0e0eJ3H+1oW0U7v6q5L3t9Q7Z+6A',
    '{"admin", "user"}'
) ON CONFLICT (username) DO NOTHING;
