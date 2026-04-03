"""Shared dependency stubs for backend API tests.

Use this helper before importing modules that pull heavyweight optional deps.
"""

from __future__ import annotations

import sys
import types
from unittest.mock import AsyncMock, MagicMock


def install_common_test_stubs(
    *, include_psutil: bool = False, include_web_stack: bool = False
) -> None:
    """Install shared sys.modules stubs used across API unit tests."""
    mock_asyncpg = MagicMock()
    mock_asyncpg.create_pool = AsyncMock()
    sys.modules["asyncpg"] = mock_asyncpg

    mock_redis_pkg = types.ModuleType("redis")
    mock_redis_asyncio = types.ModuleType("redis.asyncio")
    mock_redis_asyncio.from_url = AsyncMock()
    mock_redis_asyncio.Redis = MagicMock()
    mock_redis_pkg.asyncio = mock_redis_asyncio
    sys.modules["redis"] = mock_redis_pkg
    sys.modules["redis.asyncio"] = mock_redis_asyncio

    mock_aiokafka = types.ModuleType("aiokafka")
    mock_aiokafka.AIOKafkaConsumer = MagicMock()
    mock_aiokafka.AIOKafkaProducer = MagicMock()
    mock_aiokafka_admin = types.ModuleType("aiokafka.admin")
    mock_aiokafka_admin.AIOKafkaAdminClient = MagicMock()
    mock_aiokafka.admin = mock_aiokafka_admin
    sys.modules["aiokafka"] = mock_aiokafka
    sys.modules["aiokafka.admin"] = mock_aiokafka_admin

    mock_numpy = types.ModuleType("numpy")
    mock_numpy.bool_ = bool
    mock_numpy.isscalar = lambda _obj: False
    mock_numpy.ndarray = tuple
    sys.modules["numpy"] = mock_numpy

    sys.modules["litellm"] = MagicMock()

    if include_psutil:
        sys.modules["psutil"] = MagicMock()

    if include_web_stack:
        sys.modules.setdefault("websockets", MagicMock())
        sys.modules.setdefault("websockets.exceptions", MagicMock())
        sys.modules.setdefault("uvicorn", MagicMock())
        sys.modules.setdefault("uvicorn.protocols", MagicMock())
        sys.modules.setdefault("uvicorn.protocols.utils", MagicMock())
