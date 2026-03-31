# Fix Auth Routing for WebSockets and Fetch API

## Issue
The backend API authentication gate (`_viewer_auth`) was recently updated to require a valid `Authorization: Bearer <token>` globally on the tracks and stats routers. This inadvertently caused:
1. `401 Unauthorized` errors on the frontend, because the standard `window.fetch()` calls across the `frontend/src` directory were not configured to append the Bearer token.
2. `500 Internal Server Error` (ASGI application crash) on the `/api/tracks/live` WebSocket connection, as WebSockets cannot send standard HTTP headers and trigger an unhandled `HTTPException(401)` when dependency injection fails.
3. Fast API `HTTPBearer(auto_error=False)` dependency injection threw a TypeError because of an instantiation bug in `/api/core/auth.py`.

## Solution
1. Fixed the `TypeError` bug in the `get_current_user` logic so the framework correctly auto-resolves missing tokens safely.
2. Moved the `_viewer_auth` dependencies away from the global router level (`main.py`) inside the tracks router, placing them directly onto the HTTP-only routes in `routers/tracks.py`. This unblocked the socket connection which is handled inline.
3. Implemented a robust global `window.fetch` interceptor in `frontend/src/main.tsx` that seamlessly attaches the JWT token from `api/auth.ts` to every `/api/` HTTP request automatically.
4. Created Pytest fixtures (`override_auth`) across the test suite (`test_tracks_validation`, `test_tracks_replay`, `test_stats`) to properly override the `get_current_user` dependency for CI/CD checks without leaking across modules.

## Changes
- `backend/api/core/auth.py`: Updated `Depends` signature to instantiate `HTTPBearer()` directly.
- `backend/api/main.py`: Removed standard dependencies parameter on `tracks.router` and `stats.router` (although stats was left out of this commit, tracks required it to save the WebSocket).
- `backend/api/routers/tracks.py`: Added explicit `dependencies=_viewer_auth` to the `history`, `search`, `replay`, and `flight-info` endpoint definitions.
- `frontend/src/main.tsx`: Added an interceptor that overwrites `window.fetch` with a `const originalFetch` wrapper that merges headers and redirects automatically on `401 Unauthorized` responses.
- `backend/api/tests/`: Added fixture-based session overrides to test validation and replay logic without DB errors masking dependency assertion failures.

## Verification
- Frontend Lint (`pnpm run lint`) inside the `sovereign-frontend` container executed cleanly.
- Backend PyTest suite (`uv run python -m pytest`) inside the `sovereign-backend` container fully passed with 0 test failures.
- Both endpoints successfully connected during manual confirmation via the application frontend while logged in.

## Benefits
- Seamless adoption of the new user-first JWT authentication layer without requiring 50+ lines of refactoring across all API fetch wrappers in the UI.
- Improved backend resilience by preventing the ASGI loop crash specifically caused by WebSocket unhandled exceptions. 
- Restored parity to internal and end-to-end tests for the `tracks` routes.
