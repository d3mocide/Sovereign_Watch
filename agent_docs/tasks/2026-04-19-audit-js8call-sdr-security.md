# Audit: JS8Call & Remote SDR Connection Security

## Issue
Security audit of the JS8Call bridge (`js8call/server.py`) and RF/SDR ingestion pipeline (`backend/ingestion/rf_pulse/`) was overdue. No prior audit on record.

## Solution
Manual + automated static analysis of all relevant files covering authentication, input validation, network exposure, credential handling, XML security, and dependency posture.

## Findings

### CRITICAL

| # | Finding | File | Lines |
|---|---------|------|-------|
| C1 | XML injection in SOAP builder — no escaping on interpolated params/auth values | `backend/ingestion/rf_pulse/sources/radioref.py` | 99–110 |
| C2 | No validation on inbound UDP messages — any host on Docker network can inject forged radio frames | `js8call/server.py` | 696–710 |
| C3 | RadioReference credentials passed as plaintext env vars (visible via `docker inspect`, `/proc/self/environ`) | `docker-compose.yml` | ~221–223 |

### HIGH

| # | Finding | File | Lines |
|---|---------|------|-------|
| H1 | No authentication on WebSocket `/ws/js8` or any REST endpoint | `js8call/server.py` | 846+ |
| H2 | Default bind address is `0.0.0.0` for both FastAPI and UDP listener | `js8call/server.py` | 86, 1555 |
| H3 | KiwiSDR password accepted from unauthenticated WS client and used directly | `js8call/server.py` | 984–989 |

### MEDIUM

| # | Finding | File | Lines |
|---|---------|------|-------|
| M1 | Silent `except Exception: pass` suppresses all UDP errors — no logging | `js8call/server.py` | 709–710 |
| M2 | lxml parser missing `load_dtd=False, no_network=True` — XXE not fully hardened | `radioref.py` | 121–122 |
| M3 | CORS allows `allow_methods=["*"]`, `allow_headers=["*"]` | `js8call/server.py` | 837–838 |
| M4 | No rate limiting or connection cap on WebSocket endpoint | `js8call/server.py` | 846+ |
| M5 | `SET_FREQ` and `SET_KIWI` have no numeric range validation | `js8call/server.py` | 952, 986–987 |
| M6 | Maidenhead grid square not validated before coordinate conversion | `js8call/server.py` | 507–536 |
| M7 | `/health` endpoint exposes internal topology (WS client count, failover count, node count) unauthenticated | `js8call/server.py` | 1508–1545 |

### LOW / INFO

- Default callsign hardcoded as `N0CALL` in Dockerfile INI template (`js8call/Dockerfile:151`)
- No CVE scanning in CI/CD pipeline

## Changes
No code changes — audit only. Findings to be addressed in follow-up tasks.

## Verification
All findings manually verified by reading source files at cited line numbers.

## Benefits
Establishes a baseline of known security issues; enables prioritized remediation.
