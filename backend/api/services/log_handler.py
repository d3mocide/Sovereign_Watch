import json
import logging
from datetime import datetime, timezone

import redis


class RedisLogHandler(logging.Handler):
    """
    A logging.Handler that pushes structured log records into a Redis list
    (key: ``logs:recent``), capped at 1000 entries via LTRIM.

    Uses a synchronous Redis client (redis.Redis) since logging.Handler.emit()
    is called in a sync context.  The ``redis`` package (already a dependency)
    supports both sync and async clients.

    If Redis is unavailable or the push fails for any reason the error is
    silently swallowed so that logging never blocks or crashes the application.
    """

    MAX_ENTRIES = 1000
    KEY = "logs:recent"

    def __init__(self, redis_url: str) -> None:
        super().__init__()
        self._redis: redis.Redis = redis.Redis.from_url(
            redis_url, decode_responses=True, socket_connect_timeout=1
        )

    def emit(self, record: logging.LogRecord) -> None:
        try:
            entry = json.dumps(
                {
                    "ts": datetime.fromtimestamp(
                        record.created, tz=timezone.utc
                    ).isoformat(),
                    "level": record.levelname,
                    "logger": record.name,
                    "msg": self.format(record),
                }
            )
            pipe = self._redis.pipeline()
            pipe.lpush(self.KEY, entry)
            pipe.ltrim(self.KEY, 0, self.MAX_ENTRIES - 1)
            pipe.execute()
        except Exception:
            # Never let the log handler crash the application
            self.handleError(record)
