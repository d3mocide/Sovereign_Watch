from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

from routers.news import DEFAULT_RSS_URLS  # noqa: E402


def test_default_news_feeds_exclude_defensenews() -> None:
    assert "defensenews.com" not in DEFAULT_RSS_URLS