# Auth & User System

**Date:** 2026-03-29  
**Slug:** auth-user-system

---

## Issue

The Sovereign Watch API had no authentication layer. All endpoints were publicly accessible on the network, and there was no concept of users, roles, or permissions. The platform needed a proper authentication system to secure the API and provide role-based access control.

---

## Solution

Implemented a full JWT-based authentication system with role-based access control (RBAC), including:

- **Backend**: FastAPI auth router with login, token validation, user management endpoints, and a `require_role` dependency factory.
- **Frontend**: Login page, auth context/provider, user badge in the TopBar, and an admin-only User Management panel.
- **Database**: A `users` table in PostgreSQL with bcrypt-hashed passwords and role enforcement at the DB constraint level.

---

## Changes

### Backend

| File | Change |
|------|--------|
| `backend/api/pyproject.toml` | Added `python-jose[cryptography]`, `passlib[bcrypt]`, `python-multipart` |
| `backend/api/core/config.py` | Added JWT settings: `AUTH_ENABLED`, `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD` |
| `backend/api/core/auth.py` | **NEW** — JWT token creation/verification, bcrypt password hashing, `get_current_user` dependency, `require_role` factory |
| `backend/api/models/user.py` | **NEW** — Pydantic models: `LoginRequest`, `TokenResponse`, `UserResponse`, `UserCreate`, `UserUpdate`, `FirstSetupRequest` |
| `backend/api/routers/auth.py` | **NEW** — Auth router with endpoints: `POST /api/auth/login`, `POST /api/auth/first-setup`, `GET /api/auth/me`, `POST /api/auth/logout`, `GET/POST/GET/PATCH/DELETE /api/auth/users` |
| `backend/api/main.py` | Imported auth router, added bootstrap admin creation on startup |
| `backend/db/init.sql` | Added `users` table with `id`, `username`, `hashed_password`, `role`, `is_active`, `created_at`, `updated_at` columns, an index, and an `updated_at` trigger |
| `backend/api/tests/test_auth.py` | **NEW** — 10 tests covering login, token validation, `/me`, first-setup, and RBAC |

### Frontend

| File | Change |
|------|--------|
| `frontend/src/api/auth.ts` | **NEW** — API client for login, logout, getMe, firstSetup, listUsers, createUser, updateUser, deactivateUser; in-memory + sessionStorage token management |
| `frontend/src/hooks/useAuth.tsx` | **NEW** — `AuthProvider` + `useAuth` hook with `status`, `user`, `login`, `logout`, `hasRole` |
| `frontend/src/components/views/LoginView.tsx` | **NEW** — Login form UI with first-setup mode support |
| `frontend/src/components/widgets/UserManagementPanel.tsx` | **NEW** — Admin-only panel: list users, create users, change roles, activate/deactivate accounts |
| `frontend/src/main.tsx` | Wrapped app with `<AuthProvider>` |
| `frontend/src/App.tsx` | Added auth gate: shows loading spinner during `initialising`, `<LoginView>` when `unauthenticated` |
| `frontend/src/components/layouts/TopBar.tsx` | Added user badge (username + role chip) and logout button |
| `frontend/src/components/widgets/SystemSettingsWidget.tsx` | Added `<UserManagementPanel>` section visible only to admin role |

### Configuration

| File | Change |
|------|--------|
| `.env.example` | Added `AUTH_ENABLED`, `JWT_SECRET_KEY`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD` |

---

## Roles

| Role | Description |
|------|-------------|
| `viewer` | Read-only access to all data |
| `operator` | Read and write access |
| `admin` | Full access including user management |

---

## First-Run Setup

When no users exist, the system offers two bootstrap paths:

1. **Environment variable bootstrap**: Set `BOOTSTRAP_ADMIN_PASSWORD` in the environment; the admin account (`BOOTSTRAP_ADMIN_USERNAME`, default `admin`) is automatically created at startup.
2. **API bootstrap**: Call `POST /api/auth/first-setup` with `{"username": "...", "password": "..."}` when the user table is empty.
3. **Frontend bootstrap**: The first-setup form is shown automatically when the `/api/auth/first-setup` endpoint returns 201 (i.e., when no users exist).

---

## Developer / Local Bypass

Set `AUTH_ENABLED=false` in the environment to disable all authentication checks. All requests are treated as an admin. **Never use this in production.**

---

## Verification

```bash
# Backend
cd backend/api && ruff check .     # → All checks passed
cd backend/api && python -m pytest tests/ -v  # → 56 passed

# Frontend
cd frontend && pnpm run lint       # → exit 0
cd frontend && pnpm run typecheck  # → exit 0
cd frontend && pnpm run test       # → 36 passed
```

---

## Benefits

- **Security**: All API endpoints are now protected by JWT Bearer tokens.
- **Accountability**: Every request is tied to an authenticated user identity.
- **RBAC**: Three roles (viewer/operator/admin) allow fine-grained access control without complexity.
- **Zero-downtime bootstrap**: Existing deployments can enable auth gradually via the `AUTH_ENABLED` flag.
- **Standards-based**: Uses industry-standard JWT (HS256) + bcrypt — no custom crypto.
