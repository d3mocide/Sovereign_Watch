import os
import secrets


class Settings:
    # Database
    POSTGRES_USER = os.getenv('POSTGRES_USER', 'postgres')
    POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD')
    POSTGRES_DB = os.getenv('POSTGRES_DB', 'sovereign_watch')
    POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'sovereign-timescaledb')

    @property
    def DB_DSN(self) -> str:
        dsn = os.getenv('DB_DSN')
        if dsn:
            return dsn

        if not self.POSTGRES_PASSWORD:
            raise ValueError("POSTGRES_PASSWORD environment variable is required if DB_DSN is not provided.")

        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:5432/{self.POSTGRES_DB}"

    # Redis
    REDIS_HOST = os.getenv('REDIS_HOST', 'sovereign-redis')
    REDIS_URL = f"redis://{REDIS_HOST}:6379"

    # Security Limits
    TRACK_HISTORY_MAX_LIMIT = int(os.getenv('TRACK_HISTORY_MAX_LIMIT', '1000'))
    TRACK_HISTORY_MAX_HOURS = int(os.getenv('TRACK_HISTORY_MAX_HOURS', '72'))
    TRACK_REPLAY_MAX_LIMIT = int(os.getenv('TRACK_REPLAY_MAX_LIMIT', '10000'))
    TRACK_REPLAY_MAX_HOURS = int(os.getenv('TRACK_REPLAY_MAX_HOURS', '168'))  # 7 days
    TRACK_SEARCH_MAX_LIMIT = int(os.getenv('TRACK_SEARCH_MAX_LIMIT', '100'))

    # Kafka
    KAFKA_BROKERS = os.getenv('KAFKA_BROKERS', 'sovereign-redpanda:9092')

    # Authentication
    # When AUTH_ENABLED=false all authentication checks are skipped (local dev only).
    AUTH_ENABLED: bool = os.getenv('AUTH_ENABLED', 'true').lower() not in ('false', '0', 'no')
    # Secret key for signing JWTs — MUST be overridden in production via env var.
    JWT_SECRET_KEY: str = os.getenv('JWT_SECRET_KEY', secrets.token_urlsafe(32))
    JWT_ALGORITHM: str = os.getenv('JWT_ALGORITHM', 'HS256')
    # Access token lifetime in minutes (default 8 hours)
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv('JWT_ACCESS_TOKEN_EXPIRE_MINUTES', '480'))
    # First-run admin bootstrap credentials (only used when the users table is empty)
    BOOTSTRAP_ADMIN_USERNAME: str = os.getenv('BOOTSTRAP_ADMIN_USERNAME', 'admin')
    BOOTSTRAP_ADMIN_PASSWORD: str | None = os.getenv('BOOTSTRAP_ADMIN_PASSWORD')


settings = Settings()
