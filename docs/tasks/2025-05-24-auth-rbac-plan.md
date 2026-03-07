# Research & Plan: Authentication and RBAC Implementation

## 1. Executive Summary

The Sovereign Watch project currently lacks authentication and Role-Based Access Control (RBAC). The goal of this phase is to implement a secure, self-hosted authentication system suitable for a small team Proof of Concept (PoC) with two primary roles:
- **Admin**: Full access, including viewing and modifying system settings (e.g., API keys, mission location).
- **Analyst**: Read-only operational view; cannot access or modify system configurations.

The solution must support basic username/password authentication initially, with a clear path to supporting Multi-Factor Authentication (MFA) in the future. Given the project's edge-to-cloud and potentially air-gapped deployment model, the solution must remain entirely self-hosted within the existing Docker Compose architecture.

This document evaluates three architectural approaches, recommends the optimal path, and outlines a phased implementation plan.

---

## 2. Approach Evaluation

### Approach 1: Custom Implementation (FastAPI + JWT/Redis)
Building authentication from scratch using raw libraries (`passlib`, `bcrypt`, `PyJWT`) and FastAPI dependency injection.

*   **Pros:**
    *   **Maximum Control:** Total flexibility over the database schema, token payload, and flow.
    *   **Zero Bloat:** Only installs exactly what is needed; no unnecessary external services.
    *   **Deep Integration:** Can leverage the existing `sovereign-redis` container for stateful session management or fast token invalidation (blacklisting).
*   **Cons:**
    *   **High Risk:** Security is hard. Writing custom auth logic increases the risk of subtle vulnerabilities (e.g., timing attacks, improper token validation).
    *   **Maintenance Burden:** Adding MFA later requires building TOTP generation, validation, and recovery code from scratch.
    *   **Reinventing the Wheel:** Time-consuming to implement basic features like password reset, email verification, and session timeouts.

### Approach 2: Pre-packaged Framework (`fastapi-users` or `AuthX`)
Integrating a community-supported authentication library directly into the `backend-api` service.

*   **Pros:**
    *   **Faster Development:** Provides pre-built routers for login, registration, password reset, and user management.
    *   **Secure Defaults:** Handles password hashing, JWT generation, and cookie management safely out-of-the-box.
    *   **Database Agnostic:** Works well with the existing asyncpg/TimescaleDB setup via SQLAlchemy or raw async drivers.
*   **Cons:**
    *   **Tight Coupling:** The backend API becomes tightly coupled to the specific library's user model and schema requirements.
    *   **MFA Complexity:** While some libraries support MFA, it often requires significant custom extension or relying on beta features.
    *   **Frontend Heavy:** Still requires building all the UI components (login screens, user management panels, MFA setup) in the React frontend.

### Approach 3: Self-Hosted Identity Provider (IdP) via Nginx Forward Auth
Deploying a dedicated Identity and Access Management (IAM) service (like **Authelia**, **Authentik**, or **Keycloak**) alongside the stack and enforcing access at the Nginx reverse proxy layer, or via OIDC integration.

*   **Pros:**
    *   **Enterprise-Grade Security:** Offloads all authentication, MFA (TOTP, WebAuthn), and session management to a dedicated, battle-tested service.
    *   **Seamless MFA:** MFA is built-in and active immediately; no custom backend or frontend code required to support it.
    *   **Nginx Forward Auth:** Can protect the entire application (including the raw JS8Call websocket or future services) without modifying their source code. Nginx simply asks the IdP "Is this request allowed?" before forwarding it.
    *   **Single Sign-On (SSO):** Future-proofs the platform if other tools (e.g., Grafana for TimescaleDB metrics) are added to the stack.
*   **Cons:**
    *   **Resource Overhead:** Adds a new, sometimes heavy, container to the stack (Keycloak is very heavy; Authelia/Authentik are lighter but still require resources).
    *   **Complexity:** Requires learning and configuring a new service and adjusting Nginx routing rules.
    *   **Overkill for PoC?:** Might be considered too complex for a very small initial team.

---

## 3. Recommendation

For the Sovereign Watch architecture, **Approach 2 (Pre-packaged Framework via `fastapi-users`)** is the recommended path for the immediate PoC, with an architecture designed to eventually migrate to **Approach 3 (External IdP like Authelia)** if the deployment scales significantly.

**Why `fastapi-users` for Phase 1?**
1.  **Low Infrastructure Overhead:** It keeps the Docker Compose stack lightweight, running entirely within the existing `backend-api` and `timescaledb` containers. This is crucial for edge deployments (e.g., Jetson Nano) where memory is constrained.
2.  **Fast Time-to-Market:** It provides the necessary basic auth (username/password) and JWT cookie management instantly.
3.  **Clear RBAC Path:** We can easily extend the user model to include a `role` field (Admin vs. Analyst) and use FastAPI dependencies to protect specific routes.
4.  **Security:** It prevents us from making basic crypto mistakes (like improper hashing) while maintaining flexibility.

*Note on MFA:* While `fastapi-users` doesn't have drag-and-drop MFA, we can implement basic TOTP (using a library like `pyotp`) in a subsequent phase without throwing away the base framework.

---

## 4. Implementation Strategy (The Plan)

The implementation will be broken down into three logical phases to ensure stability.

### Phase 1: Backend Core & Database (FastAPI Users Integration)
1.  **Dependencies:** Add `fastapi-users[asyncpg]`, `passlib`, `bcrypt`, and `PyJWT` to `backend/api/requirements.txt`.
2.  **Database Schema:**
    *   Create a `users` table in `backend/db/init.sql` (UUID, email, hashed_password, role, is_active).
    *   Initial roles will be defined as an ENUM or simple String: `ADMIN`, `ANALYST`.
3.  **FastAPI Setup (`backend/api/core/security.py`):**
    *   Configure `fastapi-users` with the `asyncpg` database adapter.
    *   Configure the authentication backend to use **JWT encoded in HTTP-Only Cookies**. This is significantly more secure against XSS attacks than storing JWTs in `localStorage` on the frontend.
4.  **Route Protection:**
    *   Create custom FastAPI dependencies: `get_current_active_user`, `get_current_admin_user`.
    *   Apply `get_current_admin_user` to sensitive routes like `POST /api/config/location` (in `system.py`).
    *   Apply `get_current_active_user` to general telemetry routes.

### Phase 2: Frontend Integration (React/Vite)
1.  **Auth State Context:** Create an `AuthContext.tsx` to manage the user's logged-in state and current role globally across the app.
2.  **Login View:**
    *   Create a dedicated Login screen (`Login.tsx`) matching the "Sovereign Glass" aesthetic (dark mode, translucent panels).
    *   Update `App.tsx` to render the Login screen if no valid session exists.
3.  **API Client Updates:**
    *   Ensure all `fetch` or `axios` calls to the backend include `credentials: 'include'` so the HTTP-Only cookie is sent with every request.
4.  **RBAC UI Enforcement:**
    *   Hide "Admin" features (like the Settings panel or Mission Location editor) from users with the `ANALYST` role.

### Phase 3: Nginx & Gateway Security
1.  **API Gateway Enforcement:** Update `nginx/nginx.conf` if necessary, though the primary enforcement will happen at the FastAPI layer.
2.  **JS8Call WebSocket Protection:** The JS8Call bridge currently runs on a separate port (`8080`) and is proxied via Nginx. We must ensure that the `/js8/ws/js8` endpoint validates the user's authentication cookie before establishing the connection to prevent unauthorized access to the HF radio terminal. This may require modifying `js8call/server.py` to validate the JWT.

---

## 5. Security Considerations & Pitfalls to Avoid

*   **Pitfall 1: LocalStorage JWTs.** Storing JWTs in React's `localStorage` makes them vulnerable to Cross-Site Scripting (XSS).
    *   *Mitigation:* Use strict `HttpOnly`, `Secure`, and `SameSite=Strict` cookies issued by the FastAPI backend.
*   **Pitfall 2: Permissive CORS.** If CORS is misconfigured, a malicious site could make authenticated requests on behalf of the user.
    *   *Mitigation:* Ensure `ALLOWED_ORIGINS` in `docker-compose.yml` and `config.py` is strictly defined and does not use wildcards `*` in production.
*   **Pitfall 3: Leaking Admin Data to Analysts.** Simply hiding a button in React does not secure the data.
    *   *Mitigation:* The backend MUST enforce the RBAC. If an Analyst manually crafts a `POST` request to an Admin endpoint, FastAPI must reject it with a `403 Forbidden`.

## Conclusion

This plan establishes a secure, self-contained authentication perimeter using `fastapi-users` and HTTP-Only cookies, fulfilling the requirements for a small team PoC with Admin/Analyst roles, while maintaining the edge-deployable nature of Sovereign Watch.
