# Fix /clausal-chains Endpoint: GET + H3 Region Spatial Filter

## Issue

The `/clausal-chains` endpoint in `backend/api/routers/ai_router.py` had three problems:

1. **Wrong HTTP method**: Declared as `@router.post(...)` but all parameters were `Query(...)` params and the frontend sent them as query string arguments. This POST+Query-params combination is non-idiomatic and confusing.
2. **Region not used for filtering**: The `region` (H3 cell ID) parameter was accepted but never applied to the SQL query — returning global results for the entire lookback window regardless of region.
3. **`%s` placeholders**: The query used psycopg2-style `%s` placeholders instead of asyncpg-style `$N`, which would cause runtime errors.

## Solution

- Changed the endpoint decorator from `@router.post` to `@router.get`.
- Added spatial filtering using PostGIS `ST_Within(geom, ST_GeomFromText($N, 4326))` leveraging the existing GIST index on `clausal_chains.geom`.
- H3 cell → WKT polygon conversion done in Python with `h3.cell_to_boundary()` before passing to SQL as a parameterised value (no interpolation into query string).
- Switched all parameter placeholders to asyncpg's `$N` style.
- Updated the frontend hook (`useClausalChains.ts`) to use `method: 'GET'` instead of `'POST'`.
- Also fixed the frontend to read the auth token from `sessionStorage.getItem('sw_token')` (consistent with the app's auth pattern) instead of `localStorage.getItem('jwt_token')`.

## Changes

| File | Change |
|------|--------|
| `backend/api/routers/ai_router.py` | Added `import h3`; changed POST→GET; added H3→WKT conversion; added PostGIS ST_Within filter; fixed `$N` param placeholders |
| `frontend/src/hooks/useClausalChains.ts` | `method: 'POST'` → `'GET'`; token from `sessionStorage.getItem('sw_token')` |

## Verification

- Python AST parse confirms no syntax errors.
- H3 boundary → WKT polygon logic manually verified: `h3.cell_to_boundary()` returns `(lat, lon)` tuples; transformed to `(lon, lat)` for PostGIS WKT; ring closed by appending `coords[0]`.

## Benefits

- Correct HTTP semantics (GET for read-only retrieval).
- Region filter pushed to DB, using the existing GIST index — avoids full-table scans.
- Auth token read from the canonical `sessionStorage` key used throughout the app.
