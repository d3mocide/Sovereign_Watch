# GDELT Conflict Filter & ReliefWeb Pulse Configuration

## Issue

The `gdelt_pulse` service had hardcoded conflict-filter keywords and a hardcoded ReliefWeb `appname` query parameter, making it impossible to tune the filter without a code change and container rebuild. Additionally, GDELT event ingestion lacked structured metadata in its log output, making it harder to diagnose filter behavior in production.

## Solution

Exposed conflict-filter keyword list and ReliefWeb `appname` as environment variables (`GDELT_CONFLICT_KEYWORDS`, `RELIEFWEB_APPNAME`), defaulting to the previous hardcoded values so existing deployments are unaffected. Enhanced the event-logging path with structured per-event metadata for better observability.

## Changes

| File | Change |
|------|--------|
| `backend/ingestion/gdelt_pulse/service.py` | Read `GDELT_CONFLICT_KEYWORDS` and `RELIEFWEB_APPNAME` from env; pass to filter/fetch helpers; add structured logging fields per ingested event. |
| `backend/api/routers/gdelt.py` | Minor logging enhancement to surface filter metadata in API layer logs. |
| `.env.example` | Added `GDELT_CONFLICT_KEYWORDS` and `RELIEFWEB_APPNAME` documentation entries. |

## Verification

- Docker: `docker compose up -d --build sovereign-gdelt-pulse` — container starts, poll cycle logs structured events.
- Ruff: `uv tool run ruff check backend/ingestion/gdelt_pulse/` — clean.

## Benefits

- Operators can tune GDELT conflict keyword granularity without a code change.
- ReliefWeb `appname` is now a documented, overridable config value.
- Structured logging enables per-event tracing in production log aggregation tools.
