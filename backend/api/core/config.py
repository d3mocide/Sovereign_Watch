import os

class Settings:
    # Database
    POSTGRES_USER = os.getenv('POSTGRES_USER', 'postgres')
    POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'password')
    POSTGRES_DB = os.getenv('POSTGRES_DB', 'sovereign_watch')
    POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'sovereign-timescaledb')
    DB_DSN = os.getenv('DB_DSN', f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:5432/{POSTGRES_DB}")

    # Redis
    REDIS_HOST = os.getenv('REDIS_HOST', 'sovereign-redis')
    REDIS_URL = f"redis://{REDIS_HOST}:6379"

    # AI
    LITELLM_MODEL = "deep-reasoner"

settings = Settings()
