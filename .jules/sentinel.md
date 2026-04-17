## 2024-05-24 - Do not leak exception details in HTTP 500 responses
**Vulnerability:** Information Disclosure
**Learning:** `backend/api/routers/tracks.py` was returning internal database exception details to users by passing `str(e)` to `HTTPException(detail=...)`. Exposing exception information and stack traces enables attackers to profile the internal structure of the database or infrastructure.
**Prevention:** Catch generic exceptions, log them securely internally, and return a sanitized, non-specific error message (e.g., "Internal server error") to the client.
## 2025-05-24 - DoS vulnerability in search_tracks
**Vulnerability:** Denial of Service (DoS)
**Learning:** `backend/api/routers/tracks.py` search endpoint did not bound the `limit` parameter or query length. This allowed attackers to request massive datasets (`limit=1000000`) or send huge query strings (`q="A"*10000`), exhausting database connections and server memory.
**Prevention:** Implement strict input validation on all search endpoints, bounding output lengths (`TRACK_SEARCH_MAX_LIMIT`) and max string sizes (`len(q) <= 100`) before running expensive operations.
## 2026-03-02 - Avoid Overly Permissive CORS and Missing Security Headers
**Vulnerability:** Overly Permissive CORS
**Learning:** js8call/server.py had an overly permissive CORS configuration (allow_origins=["*"]) combined with a missing Content-Security-Policy (CSP) and HSTS. This misconfiguration posed a high risk since the server bridges WebSockets to local hardware (KiwiSDR / JS8Call radio service), meaning malicious third-party websites could initiate connections to this local server, exposing or manipulating local infrastructure.
**Prevention:** Never use wildcard CORS in applications that interface with local hardware or user credentials. Bind allow_origins to an explicit whitelist via environment variable (e.g., ALLOWED_ORIGINS). Apply standard security headers (CSP, HSTS, X-Content-Type-Options) symmetrically across all services and components, not just the primary backend API.
## 2025-05-24 - Eliminate shell injection vulnerability by avoiding `shell=True`
**Vulnerability:** Shell Injection
**Learning:** `js8call/server.py` used `subprocess.Popen(cmd, shell=True)` with dynamically generated command strings containing shell operators (`|`). While `shlex.quote` was used, relying on `shell=True` introduces significant shell injection risks if user inputs or configuration bypass validation or quoting logic.
**Prevention:** Avoid `shell=True` entirely. Refactor shell pipelines into multiple `subprocess.Popen` calls connected via standard Python I/O piping (e.g., `p2 = subprocess.Popen(..., stdin=p1.stdout)` and closing `p1.stdout` in the parent process) using array-based command arguments.
## 2026-03-04 - Eliminate SQL Injection vulnerability in TimescaleDB cleanup script
**Vulnerability:** SQL Injection
**Learning:** `backend/scripts/cleanup_timescale.py` used string interpolation (f-strings) to insert an environment variable (`RETENTION_HOURS`) directly into a SQL query. Even though the variable was previously cast to an integer, it is a critical security vulnerability to build SQL queries with string interpolation, as subsequent changes to the codebase might bypass the type coercion, exposing the application to injection attacks.
**Prevention:** Never use string interpolation to construct SQL queries. Always use parameterized queries (e.g., passing variables as a tuple to `cursor.execute`) which delegates the safe escaping of variables to the database driver.
## 2026-03-05 - Missing Input Length Constraints Leads to DoS
**Vulnerability:** Denial of Service (DoS)
**Learning:** `backend/api/routers/analysis.py` accepted extremely long `uid` path parameters without bound, and `lookback_hours` was unbounded. Unbounded user inputs can be abused to process huge payloads, consuming memory or overwhelming the database.
**Prevention:** Always enforce strict length and bounds limits on user inputs using `fastapi.Path` and `pydantic.Field` constraints.
## 2025-05-24 - Rate Limit Missing on Resource-Intensive AI Endpoints
**Vulnerability:** The `/api/analyze/{uid}` endpoint performs database aggregations and makes external LLM API calls via `litellm`. It lacked any rate limiting, creating a significant Denial of Service (DoS) and cost exhaustion risk, as malicious or buggy clients could spam the endpoint, driving up LLM provider costs and locking up the event loop with concurrent HTTP requests.
**Learning:** Endpoints that bridge to third-party LLM or vector database APIs must be strictly rate-limited due to the compute cost and billing implications, even if they appear "internal".
**Prevention:** Always implement IP-based or token-based rate limiting using Redis (`db.redis_client.incr` with `expire`) or standard FastAPI middleware on any route that invokes external AI models or performs heavy computation. Set safe defaults (e.g., 10 requests per minute).
## 2024-05-24 - Rate Limiting Missing on Global Watchlist Endpoint
**Vulnerability:** The `/api/watchlist` POST endpoint lacked rate limiting, allowing unauthenticated attackers to potentially flood the Redis backend (`zadd`) with excessive requests, causing DoS or resource exhaustion.
**Learning:** Even internal or non-sensitive configuration endpoints that write to the database/cache must be protected with rate limiting to prevent abuse and ensure service availability.
**Prevention:** Always apply rate limiting to endpoints that perform write operations, especially those accessible without authentication.
## 2024-05-25 - Fix arbitrary argument injection in subprocess.run
**Vulnerability:** Command Injection / Arbitrary Argument Injection
**Learning:** `backend/scripts/backup_timescale.py` used subprocess.run with command-line flags dynamically constructed from environment variables (e.g. `DB_HOST`, `DB_PORT`). Passing arbitrary user-controlled inputs as command line flags (like `--host`) to command line utilities via `subprocess` poses an arbitrary argument injection vulnerability.
**Prevention:** Rather than using CLI flags like `--host`, always use established standard environment variables (e.g., `PGHOST`, `PGUSER`, `PGPASSWORD`) for configuration to pass arguments to tools such as `pg_dump` when invoking them using `subprocess`.
## 2026-04-04 - Prevent SQL Injection by using asyncpg positional parameters
**Vulnerability:** Found Python string interpolation (`%s`) used with the modulo operator (`%`) to insert dynamically populated variables into a raw SQL query inside `backend/api/routers/stats.py` (e.g. `WHERE time >= NOW() - INTERVAL '%s hours' % hours`).
**Learning:** Constructing SQL queries by inserting unescaped variables directly into the SQL string via string formatting makes the application susceptible to SQL injection attacks, even for supposedly safe parameters like integers. `asyncpg` protects against this by mapping positional parameters natively at the database level.
**Prevention:** Never use Python string manipulation (`%s`, `.format()`, `f"..."`) to build parameterized SQL queries. Always use PostgreSQL native bind parameters (``, ``, etc.) and pass variables securely through the execution/fetch function arguments (e.g., `conn.fetch(query, arg1, arg2)`).
## 2026-05-24 - Log Injection vulnerability in the login endpoint
**Vulnerability:** Log Injection / Missing Input Validation
**Learning:** `backend/api/models/user.py` lacked a pattern constraint on the `username` field in `LoginRequest`. The `backend/api/routers/auth.py` endpoint directly logged this raw, unvalidated input during failed login attempts (e.g., `logger.warning("Failed login attempt for username '%s'...", body.username)`). An attacker could submit usernames containing newline characters (`\n`) to spoof legitimate log entries or inject misleading logging data, masking true malicious activity or corrupting log aggregators.
**Prevention:** Consistently apply strict regular expression pattern validations (like `pattern=r"^[a-zA-Z0-9_\-]+$"` for alphanumeric IDs) to all data-transfer objects (DTOs) that accept user input, even simple fields like login usernames. Sanitize or strictly constrain all inputs before they are interpolated into log messages.
## 2026-04-11 - [Fix Information Disclosure in API Error Response]
**Vulnerability:** Raw exception strings (e.g., `exc`) were interpolated directly into the `HTTPException` detail response sent to clients upon failure.
**Learning:** Returning unhandled or low-level internal error details to users can leak stack traces, implementation details, or sensitive system state, violating the principle of failing securely.
**Prevention:** Catch exceptions, log the detailed error securely on the server (using `logger.warning` or `logger.error`), and return only a sanitized, generic error message (like 'Malformed TLE' or 'Internal server error') in the HTTP response.
## 2026-05-24 - Fix null reference vulnerability in auth rate limiting
**Vulnerability:** Denial of Service (DoS) via Unhandled Exception
**Learning:** Blind usage of `request.client.host` in `backend/api/routers/auth.py` rate limiting logic caused an `AttributeError` when `request.client` was `None` (e.g. behind certain proxies). This crash acts as an unhandled exception, creating a Denial of Service vector where a malicious actor or misconfigured proxy could crash the request handling, bypassing rate limits or bringing down the service.
**Prevention:** Safely extract client IP addresses using fallback logic (e.g. `request.client.host if request.client and request.client.host else "unknown"`) to guarantee that rate-limiting logic does not encounter null reference errors.
## 2026-05-24 - Missing Rate Limiting on Authenticated DELETE Endpoint
**Vulnerability:** Denial of Service (DoS) / Resource Exhaustion
**Learning:** `backend/api/routers/system.py` had rate limiting on the `POST /api/watchlist` endpoint but not the `DELETE /api/watchlist/{icao24}` endpoint. While authenticated (requiring the "operator" role), a compromised account or buggy client could flood the Redis cache with `zrem` operations, potentially leading to resource exhaustion or performance degradation across the system.
**Prevention:** Consistently apply rate limiting to *all* write operations (POST, PUT, PATCH, DELETE) that interact with the database or cache, even if they require authentication. Ensure endpoints that mutate shared state are protected symmetrically.
## 2026-06-25 - Fix SSRF Vulnerability in News Proxy
**Vulnerability:** Server-Side Request Forgery (SSRF)
**Learning:** `backend/api/routers/news.py` used superficial string matching on the host (e.g. `host in {"localhost", "127.0.0.1", "::1"}`) before making requests via `httpx`. Attackers could bypass this by providing URLs resolving to internal networks (e.g., `http://127.1`, `http://0.0.0.0`, `http://169.254.169.254`).
**Prevention:** To prevent SSRF when fetching external URLs, always resolve the hostname asynchronously using `asyncio.get_running_loop().getaddrinfo()` and verify the resulting IP addresses are not private, loopback, multicast, or unspecified (using the `ipaddress` module) before making the request.
