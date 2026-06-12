## 2025-02-27 - Information Disclosure in HTTPException
**Vulnerability:** In `backend/api/routers/news.py`, an `httpx.ConnectError` triggered an `HTTPException` that directly passed `str(e)` as the error detail, potentially exposing internal networking connection strings or proxy details.
**Learning:** Returning raw exception details in HTTP responses, especially those concerning internal service connections, allows attackers to enumerate internal network setups or proxy states.
**Prevention:** Catch the exception, use internal structured logging to record `str(e)` for debugging, and raise an `HTTPException` with a generic, sanitized string (e.g. "Failed to connect to the article source.").
