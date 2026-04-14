from __future__ import annotations

import os
import sys

import httpx

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

from routers.satnogs import (  # noqa: E402
    CACHE_TTL_STATIONS_ERROR,
    MAX_STATIONS_BACKOFF,
    _build_backoff_payload,
    _extract_retry_after_seconds,
    _parse_backoff_payload,
    _sanitize_backoff_seconds,
)


def test_extract_retry_after_seconds_prefers_header_value() -> None:
    response = httpx.Response(
        429,
        headers={"Retry-After": "2079"},
        json={"detail": "Request was throttled. Expected available in 9999 seconds."},
    )

    assert _extract_retry_after_seconds(response) == 2079


def test_extract_retry_after_seconds_parses_throttle_detail() -> None:
    response = httpx.Response(
        429,
        json={"detail": "Request was throttled. Expected available in 2079 seconds."},
    )

    assert _extract_retry_after_seconds(response) == 2079


def test_extract_retry_after_seconds_uses_default_when_unparseable() -> None:
    response = httpx.Response(429, json={"detail": "rate limited"})

    assert _extract_retry_after_seconds(response) == CACHE_TTL_STATIONS_ERROR


def test_sanitize_backoff_seconds_clamps_to_bounds() -> None:
    assert _sanitize_backoff_seconds(1) == CACHE_TTL_STATIONS_ERROR
    assert _sanitize_backoff_seconds(MAX_STATIONS_BACKOFF + 1) == MAX_STATIONS_BACKOFF


def test_build_and_parse_backoff_payload_round_trip() -> None:
    payload = _parse_backoff_payload(
        _build_backoff_payload(retry_after_s=2079, reason="http_429")
    )

    assert payload is not None
    assert payload["reason"] == "http_429"
    assert payload["retry_after_s"] == 2079
    assert isinstance(payload["backoff_until"], int)