## Issue
API endpoints were returning dynamic exception strings in some error responses, creating a medium-risk information disclosure path that could expose internal failure details to clients.

## Solution
Replaced client-visible dynamic error details with generic response text while keeping full failure context in server logs for debugging and incident response.

## Changes
- Security hardening implemented in:
  - backend/api/routers/ai_router.py
  - backend/api/routers/news.py
  - backend/api/routers/stats.py
  - backend/api/services/ai_service.py
- Supporting workflow note:
  - .jules/sentinel.md
- Response behavior now avoids leaking internal exception strings to external callers.

## Verification
- Backend API lint: pass (`uv tool run ruff check .`)
- Backend API tests: pass (158 passed)

## Benefits
- Reduces externally visible system internals and attack surface.
- Maintains developer observability through server-side logging.
- Improves compliance with secure error-handling best practices.
