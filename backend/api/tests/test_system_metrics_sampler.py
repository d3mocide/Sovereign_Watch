"""Slow host sampling must leave the API event loop responsive."""
import asyncio
import time
from itertools import pairwise
from unittest.mock import AsyncMock

import pytest

from services import system_metrics as module


@pytest.mark.asyncio
async def test_sampling_is_offloaded_and_cold_calls_share_cache(monkeypatch):
    cache = {}
    async def get(key):
        return cache.get(key)
    async def setex(key, ttl, value):
        cache[key] = value
    monkeypatch.setattr(module.db, "redis_client", type("Redis", (), {
        "get": staticmethod(get), "setex": staticmethod(setex),
        "info": AsyncMock(return_value={}),
    })())
    samples = []
    def slow_host():
        samples.append(1)
        time.sleep(0.2)
        return {"cpu_percent": 1}
    monkeypatch.setattr(module, "sample_host", slow_host)
    sampler = module.SystemMetricsSampler()
    monkeypatch.setattr(sampler, "_lag", AsyncMock(return_value={}))
    ticks = []
    async def ticker():
        for _ in range(10):
            ticks.append(time.monotonic())
            await asyncio.sleep(0.01)
    first, second, _ = await asyncio.gather(sampler.collect(), sampler.collect(), ticker())
    assert first == second
    assert len(samples) == 1
    assert max(b - a for a, b in pairwise(ticks)) < 0.1
