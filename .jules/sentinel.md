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
## 2026-03-03 - Prevent Command Injection with subprocess.Popen
**Vulnerability:** Command injection vulnerability in `_start_kiwi_pipeline` inside `js8call/server.py`.
**Learning:** Using `shell=True` in `subprocess.Popen` exposes the system to command injection vulnerabilities, especially when concatenating strings or utilizing user input. Even with input validation or partial escaping with tools like `shlex.quote`, the risk persists. Piping commands (e.g. `cmd1 | cmd2`) in a single `shell=True` command is dangerous.
**Prevention:** To prevent shell injection vulnerabilities, `subprocess.Popen` calls must not use `shell=True`. Complex shell commands (like pipes) should be implemented using list-based arguments and native Python subprocess piping (e.g., passing `stdin=p1.stdout` and calling `p1.stdout.close()` in the parent).
