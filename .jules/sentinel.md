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
