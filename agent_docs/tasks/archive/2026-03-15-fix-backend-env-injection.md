# 2026-03-15-fix-backend-env-injection

## Issue
The `backend-api` service in `docker-compose.yml` was missing several environment variables required for the System Health check to accurately report stream status. Specifically, `AISSTREAM_API_KEY`, `REPEATERBOOK_API_TOKEN`, and `RADIOREF_*` credentials were not being passed to the container, causing the health check to report them as "Missing Key" or "Disabled".

## Solution
Update `docker-compose.yml` to include the missing environment variables for the `backend-api` service, pulling them from the host's `.env` file.

## Changes
- Modified `backend-api` service in `docker-compose.yml` to include:
    - `AISSTREAM_API_KEY`
    - `REPEATERBOOK_API_TOKEN`
    - `RADIOREF_APP_KEY`
    - `RADIOREF_USERNAME`
    - `RADIOREF_PASSWORD`
    - `CENTER_LAT`, `CENTER_LON`, `COVERAGE_RADIUS_NM` (for defaults)

## Verification
- Run `docker compose up backend-api -d`
- Check `/api/config/streams` endpoint in the frontend or via curl.
