# Release - v1.0.11 - Accessibility and Error Hardening

## Summary
This release strengthens operator usability and API security posture. It delivers a focused accessibility pass across high-use controls and closes an information disclosure path in backend error responses by removing client-visible internal exception details while preserving server-side diagnostics.

## Key Features
- **Accessibility Sweep**: Improved icon-only control labels, keyboard focus-visible behavior, and control semantics across JS8 and sidebar operator panels.
- **ARIA Toggle Compliance**: Updated toggle patterns to keep stable accessible names while relying on explicit state attributes such as `aria-pressed` and `aria-expanded`.
- **API Error Hardening**: Replaced dynamic client error text with generic safe responses across AI/news/stats paths to reduce information leakage.

## Technical Details
- Frontend touched surfaces include accessibility refinements in JS8, layer controls, user controls, and sidebar actions.
- Backend routers and AI service paths now avoid returning internal exception details to clients while preserving operational logs.
- Verification gate for this release passed with frontend lint/typecheck/test, backend lint/tests, and JS8 lint/tests.

## Upgrade Instructions
To apply these updates, pull the latest changes and rebuild the containers:

```bash
git pull origin dev
make dev  # or make prod
```

If running in production, rebuild and restart to ensure the latest frontend and backend changes are active:
```bash
docker compose build sovereign-frontend
docker compose up -d
```
