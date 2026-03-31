import os
import secrets
import logging

logger = logging.getLogger("SovereignWatch.Config")


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
    # When AUTH_ENABLED=false all authentication checks are skipped (local dev only — NEVER in production).
    AUTH_ENABLED: bool = os.getenv('AUTH_ENABLED', 'true').lower() not in ('false', '0', 'no')

    # Secret key for signing JWTs.
    # If not explicitly provided and auth is enabled, a random key is generated per
    # process — which invalidates all tokens on restart.  In production you MUST set
    # JWT_SECRET_KEY to a stable secret (e.g. `openssl rand -hex 32`).
    _raw_jwt_secret: str | None = os.getenv('JWT_SECRET_KEY')
    # Cached fallback secret so the same value is used throughout the process lifetime.
    _fallback_jwt_secret: str = secrets.token_urlsafe(32)

    @property
    def JWT_SECRET_KEY(self) -> str:
        if self._raw_jwt_secret:
            return self._raw_jwt_secret
        if self.AUTH_ENABLED:
            logger.warning(
                "JWT_SECRET_KEY is not set — using an ephemeral random secret. "
                "All tokens will be invalidated on restart. "
                "Set JWT_SECRET_KEY in production!"
            )
        return self._fallback_jwt_secret

    _JWT_ALGORITHM_RAW: str = os.getenv('JWT_ALGORITHM', 'HS256')

    @property
    def JWT_ALGORITHM(self) -> str:
        _allowed = {"HS256", "HS384", "HS512"}
        if self._JWT_ALGORITHM_RAW not in _allowed:
            raise ValueError(
                f"JWT_ALGORITHM must be one of {sorted(_allowed)}, "
                f"got '{self._JWT_ALGORITHM_RAW}'"
            )
        return self._JWT_ALGORITHM_RAW
    # Access token lifetime in minutes (default 8 hours)
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv('JWT_ACCESS_TOKEN_EXPIRE_MINUTES', '480'))


settings = Settings()
