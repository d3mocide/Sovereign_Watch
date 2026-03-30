# Auth Hardening & Security Review

**Date:** 2026-03-30
**Slug:** auth-hardening-security-review
**Branch:** `claude/review-jwt-auth-7m6c0`
**Follows:** [`2026-03-29-auth-user-system.md`](./2026-03-29-auth-user-system.md)

---

## Background

A full security review was conducted against the JWT authentication and RBAC system
introduced in `2026-03-29-auth-user-system.md`. Findings were triaged by severity and
resolved in three commit groups on `claude/review-jwt-auth-7m6c0`.

The original auth document's description of the system is still accurate for the
overall architecture. This document records every change made since that baseline and
lists the one remaining open item.

---

## Resolved Findings

### Critical

| # | Finding | Fix |
|---|---------|-----|
| C-1 | Plaintext password written to logs in `update_user` audit line | `model_dump(exclude={"password"})` + redacted `"***"` placeholder |
| C-2 | No rate limiting on `/login` or `/first-setup` — brute-force trivial | Redis-backed `check_rate_limit()` in `core/auth.py` — 10 req/min on login, 5 req/min on first-setup; fail-open on Redis outage |

### High

| # | Finding | Fix |
|---|---------|-----|
| H-1 | TOCTOU race condition on `/first-setup` (count → insert gap) | Replaced with atomic `INSERT … WHERE NOT EXISTS … RETURNING` — no two-step check |
| H-2 | `/first-setup` 409 response leaked that users exist | Returns 404 `"Not found"` regardless of reason — no state inference possible |
| H-3 | `deactivate_user` applied `require_role("admin")` twice (decorator + param), causing two DB round-trips | Removed `dependencies=[…]` from decorator; function-param form is sufficient |

### Medium

| # | Finding | Fix |
|---|---------|-----|
| M-1 | `ROLES.index()` raised uncaught `ValueError` → HTTP 500 if DB row had unexpected role | Safe lookup: `ROLES.index(role) if role in ROLES else -1` → always yields 403, never 500 |
| M-2 | No last-admin protection — any admin could deactivate all other admins | `deactivate_user` now queries `COUNT(*) WHERE role='admin' AND is_active=TRUE`; blocks if ≤ 1 |
| M-3 | `updated_at` not maintained by API UPDATE statements | Already handled by a `BEFORE UPDATE` trigger in `init.sql` — no change needed |

### Low / Informational

| # | Finding | Fix |
|---|---------|-----|
| L-1 | `JWT_ALGORITHM` env var accepted any string including `none` | Converted to a property with allowlist `{HS256, HS384, HS512}`; raises `ValueError` on startup if invalid |
| L-2 | `role` JWT claim used for nothing but could mislead future contributors | Added `# NOTE` comment on the `create_access_token` call in `routers/auth.py` |
| L-3 | `sessionStorage` XSS surface (acknowledged, lower severity for internal tool) | Documented; HttpOnly cookie migration noted as a future hardening path |

---

## Feature Changes

### First-Run Setup: env-var bootstrap removed; UI-first flow wired

The original system had two first-run paths: an env-var bootstrap (`BOOTSTRAP_ADMIN_PASSWORD`
at container startup) and an unconnected UI form that was never reachable from the app shell.

**Removed:**
- `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` env vars
- Bootstrap block in `main.py` lifespan handler
- Corresponding config properties in `core/config.py`
- `get_user_by_username` and `hash_password` imports in `main.py` (were only used there)

**Added:**
- `GET /api/auth/setup-status` — public endpoint returning `{"setup_required": bool}`.
  Returns `false` when DB is unreachable (show login screen, not a misleading setup form).
- `getSetupStatus()` in `frontend/src/api/auth.ts`
- Setup detection in `App.tsx`: checks `setup-status` on every `unauthenticated` transition;
  passes `isFirstSetup={true}` to `<LoginView>` when the table is empty
- `backend/api/manage.py` — break-glass CLI for headless/automated deployments:
  ```bash
  docker exec -it sovereign-backend python manage.py create-admin [--username NAME]
  ```
  Password is prompted interactively — never stored in env vars, files, or logs.
  Uses `INSERT … ON CONFLICT DO NOTHING` so safe to run even if the username exists.

**Updated docker-compose.yml / .env.example:**
- `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` lines removed
- `.env.example` updated with a reference to `manage.py`

### LoginView: Sovereign Glass redesign

The login/first-run screen was rebuilt to match the glass morphism design language
used by every other widget in the app.

| Before | After |
|--------|-------|
| `bg-gray-950` + inline SVG grid | `bg-tactical-bg` + `bg-grid-pattern` token |
| `bg-gray-900 border-gray-700` card | `bg-black/60 backdrop-blur-md border-hud-green/20` glass panel |
| No glow or depth effects | `shadow-[0_0_50px_rgba(0,255,65,0.07),inset_0_1px_1px_rgba(255,255,255,0.06)]` |
| `text-emerald-400` shield (wrong green, no glow) | `text-hud-green drop-shadow-[0_0_14px_rgba(0,255,65,0.9)]` |
| `bg-emerald-600` button | `bg-hud-green text-black hover:shadow-[0_0_28px_rgba(0,255,65,0.45)]` |
| Generic gray labels | `text-hud-green/55 uppercase tracking-[0.3em]` |
| Gray error box | `bg-alert-red/8 border border-alert-red/30 text-alert-red` |
| First-setup: plain subtext | Amber pulsing badge with `shadow-[0_0_6px_rgba(251,191,36,0.8)]` |
| Fade-in: `duration-1000` | `animate-in fade-in duration-700` + scanline sweep |

### P0: Global authentication gate on all data routers

All 17 data routers are now protected by `require_role("viewer")` applied via
`include_router(dependencies=_viewer_auth)` in `main.py`. Previously only `auth.router`
had endpoint-level auth.

`/health` was moved from `system.router` to a direct `@app.get("/health")` on the
FastAPI app so it remains public for Docker/nginx health probes.

`auth.router` continues to manage its own per-endpoint auth.

**⚠️ Open gap:** `tracks.router` is included with `_viewer_auth` which protects the
HTTP endpoints, but the WebSocket at `GET /api/tracks/live` will reject connections
because browsers cannot send `Authorization` headers on WebSocket upgrades.
See **Remaining Work** below.

### P1: Failed login audit logging

`POST /api/auth/login` now logs:
- `WARNING` on bad credentials: username + client IP
- `WARNING` on disabled-account attempt: username + client IP
- `INFO` on successful auth: username + client IP

### P1: POSTGRES_PASSWORD is now required

`${POSTGRES_PASSWORD:-password}` → `${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in .env}`
in all four docker-compose.yml occurrences. `docker compose up` will fail loudly if the
variable is not set rather than silently using `"password"`.

### P2: `password_version` — immediate token invalidation on password change

A `password_version INT NOT NULL DEFAULT 0` column was added to the `users` table:

```sql
-- init.sql: in CREATE TABLE definition
password_version INT NOT NULL DEFAULT 0

-- init.sql: migration for existing databases
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_version INT NOT NULL DEFAULT 0;
```

At login, the current `password_version` is embedded in the JWT as the `pwv` claim:
```python
create_access_token({"sub": str(user["id"]), "role": user["role"], "pwv": user["password_version"]})
```

`get_current_user` (called on every authenticated request) now verifies:
```python
if payload.get("pwv", 0) != user.get("password_version", 0):
    raise HTTPException(401, "Token invalidated — please log in again")
```

When a password is changed via `PATCH /api/auth/users/{id}`, the update clause includes:
```sql
password_version = password_version + 1
```

This immediately invalidates all tokens issued before the password change, without
needing a blocklist or Redis lookup.

### P2: CORS tightened

`allow_methods=["*"]` → `["GET", "POST", "PATCH", "DELETE", "OPTIONS"]`
`allow_headers=["*"]` → `["Authorization", "Content-Type"]`

### P3: `TokenResponse.expires_in` + `UserResponse.created_at`

`TokenResponse` now includes `expires_in: int` (seconds until expiry), computed as
`settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60`. Clients no longer need to decode the
JWT to know when to prompt for re-auth.

`UserResponse` now includes `created_at: datetime | None = None`. All relevant SQL
queries were updated to `SELECT`/`RETURNING` the column. The field is optional (`None`)
for backwards compatibility with test fixtures that don't include it.

### Nginx TLS template

A commented TLS block was added to `nginx/nginx.conf` documenting:
- HTTP → HTTPS redirect server block
- TLS termination with Let's Encrypt cert paths
- Modern cipher suite (`TLSv1.2 TLSv1.3`, ECDHE-only)
- HSTS header

---

## Files Changed

### Backend

| File | Change |
|------|--------|
| `backend/api/core/auth.py` | `check_rate_limit()` added; `get_user_by_username` / `get_user_by_id` fetch `created_at` + `password_version`; `get_current_user` checks `pwv` claim; `require_role` safe-indexes `ROLES` |
| `backend/api/core/config.py` | `JWT_ALGORITHM` converted to property with `{HS256,HS384,HS512}` allowlist; `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` removed |
| `backend/api/routers/auth.py` | Rate limiting on login + first-setup; failed-login warning logs with IP; `pwv` + `expires_in` in login response; atomic first-setup SQL; 404 (not 409) when already set up; `password_version` increment on password change; `created_at` in all RETURNING clauses; double-dependency removed from `deactivate_user`; last-admin guard added; password redacted in update audit log; `GET /api/auth/setup-status` endpoint |
| `backend/api/routers/system.py` | `/health` endpoint removed (moved to `main.py`) |
| `backend/api/models/user.py` | `TokenResponse` + `expires_in: int`; `UserResponse` + `created_at: datetime \| None` |
| `backend/api/main.py` | `require_role` import; `@app.get("/health")` inline; `_viewer_auth` applied to all 17 data routers; CORS tightened; bootstrap block removed |
| `backend/api/manage.py` | **NEW** — `create-admin` CLI for headless deployments and break-glass recovery |
| `backend/api/tests/test_auth.py` | `_MOCK_USER` / `_MOCK_VIEWER` updated with `password_version` + `created_at`; `test_login_success` asserts `expires_in`; `test_first_setup_*` updated for atomic mock (no `fetchval`) + 404 expected; `test_setup_status_when_empty` + `test_setup_status_when_users_exist` added (12 tests total) |
| `backend/db/init.sql` | `password_version` column in `CREATE TABLE`; `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migration |

### Frontend

| File | Change |
|------|--------|
| `frontend/src/api/auth.ts` | `getSetupStatus()` added |
| `frontend/src/App.tsx` | `getSetupStatus` import; `setupRequired` state; `useEffect` to check setup on `unauthenticated`; `<LoginView isFirstSetup={setupRequired} />` when detected |
| `frontend/src/components/views/LoginView.tsx` | Full Sovereign Glass redesign (see design table above) |

### Infrastructure

| File | Change |
|------|--------|
| `docker-compose.yml` | `BOOTSTRAP_ADMIN_*` lines removed; `POSTGRES_PASSWORD` changed from `:-password` to `:?required` in all four occurrences |
| `.env.example` | `BOOTSTRAP_ADMIN_*` lines removed; `POSTGRES_PASSWORD` marked as required; `manage.py` reference added |
| `nginx/nginx.conf` | TLS configuration template added as comments |

---

## Verification

```bash
# Backend — must pass before merge
cd backend/api && uv tool run ruff check .           # → All checks passed
cd backend/api && uv run python -m pytest tests/test_auth.py -v  # → 12 passed

# Frontend — must pass before merge
cd frontend && pnpm run lint                          # → exit 0
```

---

## Remaining Work

### WebSocket authentication on `/api/tracks/live` (P0 — separate PR)

**Problem:** Browsers cannot set `Authorization` headers on WebSocket connections.
The `require_role("viewer")` dependency applied to `tracks.router` protects all HTTP
endpoints in that router, but the WebSocket at `GET /api/tracks/live` will be rejected
with 401 because no token can be sent.

**Required changes (both sides in one PR):**

Backend — `backend/api/routers/tracks.py`:
```python
from fastapi import Query
from core.auth import _decode_token, get_user_by_id
from core.config import settings

@router.websocket("/api/tracks/live")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str | None = Query(default=None),
):
    if settings.AUTH_ENABLED:
        if not token:
            await websocket.close(code=4001, reason="Authentication required")
            return
        try:
            payload = _decode_token(token)
            user_id = int(payload["sub"])
            user = await get_user_by_id(user_id)
            if not user or not user["is_active"]:
                raise ValueError
        except Exception:
            await websocket.close(code=4001, reason="Invalid or expired token")
            return
    # ... existing handler ...
```

Frontend — `frontend/src/workers/WorkerProtocol.ts`:
```typescript
import { getToken } from '../api/auth';

const getWsUrl = () => {
    const base = /* existing URL logic */;
    const token = getToken();
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
};
```

**Risk:** Token in URL is visible in server access logs. Mitigations:
- Short TTL (already 8 hours; could be reduced further for WS)
- Token is not logged by nginx if log format is customised to exclude query strings
- Longer term: move to a one-time WS ticket endpoint (`POST /api/auth/ws-ticket`)
  that returns a short-lived (30s) single-use token for the WS handshake only

---

### HttpOnly cookie token storage (P2 — future hardening)

Current storage is in-memory + `sessionStorage`. Migrating to an `HttpOnly; Secure; SameSite=Strict`
cookie would eliminate the XSS token-theft vector entirely, at the cost of requiring
backend `Set-Cookie` on login and `cookie` extraction in `get_current_user`.

---

### TLS in production (infrastructure)

The nginx TLS template in `nginx/nginx.conf` is ready. Enabling it requires:
1. Obtaining a certificate (Let's Encrypt: `certbot certonly --standalone -d your.domain`)
2. Mounting the cert into the nginx container via a Docker volume
3. Replacing the `listen 80` server block with the redirect stub
4. Uncommenting the TLS server block
5. Updating CSP `ws:` → `wss:` in `backend/api/main.py` (already noted inline)
