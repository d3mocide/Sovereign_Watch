# SSRF & DNS Rebinding Mitigation in News Article Fetcher

## Issue

The `/api/news/article` endpoint was vulnerable to Server-Side Request Forgery (SSRF) and Time-Of-Check to Time-Of-Use (TOCTOU) DNS Rebinding. 

Previously, `_is_safe_host()` verified that a user-provided domain resolved to a public IP, but `httpx.AsyncClient` was then invoked with the original hostname, performing a second DNS resolution. A malicious DNS server could return a safe IP during the check and a private IP (e.g., local address or cloud metadata) during the fetch, bypassing security checks.

## Solution

Implemented `SSRFSafeTransport` subclassing `httpx.AsyncHTTPTransport` to ensure a single DNS resolution is used for both verification and connection:
1. Resolves the hostname once using `asyncio.getaddrinfo`.
2. Validates that the resolved IP addresses are public, non-loopback, non-private, non-multicast, and specified.
3. Mutates the request URL host to connect directly to the verified safe IP.
4. Preserves the original hostname in `request.extensions["sni_hostname"]` to maintain valid TLS/SNI certificate verification.

## Changes

- `backend/api/routers/news.py` — Added `SSRFSafeTransport` and wired it into `httpx.AsyncClient` for both RSS feed checking and article extraction.
- `.jules/sentinel.md` — Added developer learning entry for SSRF/DNS Rebinding mitigation.

## Verification

- Backend unit tests (`tests/test_news_router.py`) pass successfully.
- Code review and verification using `ruff check` on the backend API files are clean.

## Benefits

- Prevents SSRF attacks bypassing pre-flight checks via DNS Rebinding.
- Ensures local microservices and internal API resources are completely insulated from third-party URL queries.
