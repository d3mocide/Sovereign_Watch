from typing import Optional
import asyncpg
import redis.asyncio as redis
from core.config import settings

class Database:
    pool: Optional[asyncpg.Pool] = None
    redis_client: Optional[redis.Redis] = None

    @classmethod
    async def connect(cls):
        if not cls.pool:
            cls.pool = await asyncpg.create_pool(settings.DB_DSN)

        if not cls.redis_client:
            cls.redis_client = await redis.from_url(settings.REDIS_URL, decode_responses=True)

    @classmethod
    async def disconnect(cls):
        if cls.pool:
            await cls.pool.close()
            cls.pool = None

        if cls.redis_client:
            await cls.redis_client.aclose() if hasattr(cls.redis_client, 'aclose') else await cls.redis_client.close()
            cls.redis_client = None

db = Database
