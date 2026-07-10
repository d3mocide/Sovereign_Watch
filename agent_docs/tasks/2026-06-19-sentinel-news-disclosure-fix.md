# Sentinel: News Fetcher Information Disclosure Fix

## Issue

In `backend/api/routers/news.py`, when a connection error occurred during fetching news article content, the endpoint caught `httpx.ConnectError` and passed `str(e)` directly into the `HTTPException` detail. This leaked internal network/infrastructure details or host connection failures to untrusted clients.

## Solution

Sanitize client-facing error messages by returning a generic "Failed to connect to article source" message instead of raw exception details, while preserving internal logging.

## Changes

- **`backend/api/routers/news.py`**
  - Updated `httpx.ConnectError` exception handler in `get_article_content` to raise an `HTTPException` with a sanitized detail string ("Failed to connect to article source").

## Verification

Run on host (`backend/api`):
- `uv tool run ruff check routers/news.py` -> All checks passed.
- `uv run python -m pytest tests/test_news_router.py` -> All tests passed.

## Benefits

- Prevents information disclosure about internal network topology or client-side connection states.
