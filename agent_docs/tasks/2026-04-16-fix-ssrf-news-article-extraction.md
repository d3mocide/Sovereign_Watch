# Fix: SSRF Vulnerability in News Article Extraction

## Issue

The `/api/news/article` reader endpoint made outbound HTTP requests to arbitrary URLs supplied by the frontend. An authenticated operator could craft a request URL pointing at internal services (e.g., `http://localhost/`, `http://169.254.169.254/` metadata endpoints, `http://redis:6379/`) and receive their content, constituting a Server-Side Request Forgery (SSRF) vulnerability rated HIGH.

## Solution

Added a blocklist validator that rejects requests before any socket connection is opened. The validator refuses:
- Non-HTTP/HTTPS schemes (`file://`, `ftp://`, `gopher://`, etc.)
- Loopback addresses (`127.0.0.0/8`, `::1`)
- Link-local / metadata ranges (`169.254.0.0/16`, `fe80::/10`)
- RFC-1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- Unspecified (`0.0.0.0`, `::`)

## Changes

| File | Change |
|------|--------|
| `backend/api/routers/news.py` | Added `_validate_url()` guard called before `httpx` fetch in the article reader route; returns `400 Bad Request` on blocked targets. |

## Verification

- `cd backend/api && uv tool run ruff check .` — passed (clean).
- `cd backend/api && uv run python -m pytest tests/test_news_router.py` — passed.
- Manual review: private IP and `file://` URLs return `400`; public URLs proceed normally.

## Benefits

- Eliminates SSRF attack surface in the news article extraction path.
- Fails closed (400) rather than proxying the disallowed request.
- Validator is a pure-Python stdlib function — no new dependencies.
