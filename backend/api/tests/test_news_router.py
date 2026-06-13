from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

import routers.news as news  # noqa: E402
from routers.news import DEFAULT_RSS_URLS  # noqa: E402


def test_default_news_feeds_exclude_defensenews() -> None:
    assert "defensenews.com" not in DEFAULT_RSS_URLS


class FakeRedis:
    """Minimal async Redis double for the news cache paths."""

    def __init__(self, store: dict | None = None):
        self.store = dict(store or {})

    async def set(self, key, value, ex=None, nx=False):
        if nx and key in self.store:
            return None
        self.store[key] = value
        return True

    async def setex(self, key, ttl, value):
        self.store[key] = value
        return True

    async def get(self, key):
        return self.store.get(key)

    async def exists(self, key):
        return 1 if key in self.store else 0

    async def delete(self, key):
        self.store.pop(key, None)
        return True


@pytest.mark.asyncio
async def test_fresh_cache_served_without_refresh(monkeypatch):
    """A fresh cache is returned directly and triggers no background refresh."""
    cached = [{"title": "x", "link": "", "pub_date": "", "source": "S"}]
    fake = FakeRedis({news.CACHE_KEY: json.dumps(cached), news.CACHE_FRESH_KEY: "1"})
    monkeypatch.setattr(news.db, "redis_client", fake)

    triggered = {"n": 0}

    async def _spy():
        triggered["n"] += 1

    monkeypatch.setattr(news, "_trigger_refresh", _spy)

    result = await news.get_news_feed(limit=40)
    assert result == cached
    assert triggered["n"] == 0


@pytest.mark.asyncio
async def test_stale_cache_served_and_triggers_refresh(monkeypatch):
    """A stale cache (no fresh marker) is served immediately and refreshed in bg."""
    cached = [{"title": "x", "link": "", "pub_date": "", "source": "S"}]
    fake = FakeRedis({news.CACHE_KEY: json.dumps(cached)})  # no CACHE_FRESH_KEY
    monkeypatch.setattr(news.db, "redis_client", fake)

    triggered = {"n": 0}

    async def _spy():
        triggered["n"] += 1

    monkeypatch.setattr(news, "_trigger_refresh", _spy)

    result = await news.get_news_feed(limit=40)
    assert result == cached
    assert triggered["n"] == 1


@pytest.mark.asyncio
async def test_cold_cache_fetches_synchronously(monkeypatch):
    """With no cache available, the endpoint fetches synchronously."""
    monkeypatch.setattr(news.db, "redis_client", None)
    fetched = [{"title": "live", "link": "", "pub_date": "", "source": "S"}]

    async def _fake_fetch():
        return fetched

    monkeypatch.setattr(news, "_fetch_feeds", _fake_fetch)

    result = await news.get_news_feed(limit=40)
    assert result == fetched


@pytest.mark.asyncio
async def test_fetch_feeds_merges_and_sorts_concurrently(monkeypatch):
    """_fetch_feeds gathers every source, merges, sorts newest-first, strips _ts."""
    monkeypatch.setenv("NEWS_RSS_URLS", "https://a.example,https://b.example")
    monkeypatch.setattr(news.db, "redis_client", None)

    per_url = {
        "https://a.example": [
            {"title": "old", "link": "", "pub_date": "", "source": "A", "_ts": 100.0}
        ],
        "https://b.example": [
            {"title": "new", "link": "", "pub_date": "", "source": "B", "_ts": 200.0}
        ],
    }

    async def _fake_fetch_one(_client, url):
        return per_url[url]

    monkeypatch.setattr(news, "_fetch_one", _fake_fetch_one)

    result = await news._fetch_feeds()
    assert [r["title"] for r in result] == ["new", "old"]  # sorted newest-first
    assert all("_ts" not in r for r in result)  # internal field stripped


@pytest.mark.asyncio
async def test_trigger_refresh_dedupes_with_nx_lock(monkeypatch):
    """Only the worker that wins the NX lock spawns the refresh task."""
    # Lock already held → no task spawned.
    fake = FakeRedis({news.CACHE_REFRESH_LOCK: "1"})
    monkeypatch.setattr(news.db, "redis_client", fake)
    monkeypatch.setattr(news, "_refresh_task", None)

    spawned = {"n": 0}

    async def _fake_refresh():
        spawned["n"] += 1

    monkeypatch.setattr(news, "_refresh_and_release", _fake_refresh)

    await news._trigger_refresh()
    assert spawned["n"] == 0  # lock contended → nothing spawned


@pytest.mark.asyncio
async def test_warm_cache_triggers_refresh(monkeypatch):
    """Startup warm-up delegates to the background refresh and never blocks."""
    called = {"n": 0}

    async def _spy():
        called["n"] += 1

    monkeypatch.setattr(news, "_trigger_refresh", _spy)
    await news.warm_cache()
    assert called["n"] == 1
