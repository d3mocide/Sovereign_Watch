# API Patterns - Sovereign Watch

> **CRITICAL:** Sovereign Watch strictly uses **FastAPI (Python)** and the **TAK Protocol V1 (Protobuf)** for inter-service communication.

## Core Rules

1.  **FastAPI Routing**: All backend endpoints must be built using FastAPI. Routes should be organized cleanly in `backend/api/routers/`.
2.  **TAK Protocol**: Inter-service streaming and tactical data exchange must use TAK Protocol V1 (Protobuf). **DO NOT** use ad-hoc JSON for high-throughput event streaming. TAK Protocol Buffer messages are prefixed with the magic header `0xbf 0x01 0xbf`.
3.  **Input Validation**: Use Pydantic models for all incoming HTTP requests.
4.  **Error Handling**: Input validation (returning HTTP 400) must precede infrastructure availability checks (like database pool status returning 503) to distinguish client errors from server outages. Never leak raw database exceptions (e.g., return HTTP 500 'Internal server error' instead of psycopg2 errors).
5.  **Security Middleware**: The backend enforces security headers (HSTS, CSP `default-src 'none'`). Note that `/docs`, `/redoc`, and `/openapi.json` have relaxed CSP to support Swagger UI execution.
6.  **WebSockets**: The `BroadcastManager` service (`backend/api/services/broadcast.py`) handles WebSockets. It includes a 0.5s timeout on sends to prevent slow clients from blocking the realtime broadcast loop.

## Testing
Run backend API tests using:
`PYTHONPATH=backend/api python -m pytest backend/api/tests/`