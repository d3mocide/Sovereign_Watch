# Python Patterns - Sovereign Watch

> **CRITICAL:** Sovereign Watch uses Python heavily for its FastAPI backend and Ingestion Pollers.

## Core Rules

1.  **Asynchronous Programming**:
    *   To prevent blocking the `asyncio` event loop in ingestion services, CPU-bound tasks (like `sgp4` TLE parsing) must be offloaded to a thread pool using `asyncio.to_thread`.
    *   The Space Pulse ingestion service in `backend/ingestion/space_pulse/` uses asynchronous patterns (`aiohttp`, `asyncio`, optional `aiofiles`) to avoid blocking I/O in hot loops.
2.  **Linting (Ruff)**:
    *   Python code must not use multiple statements on a single line (e.g., `if x: return y`) to comply with `ruff` rule `E701`.
    *   Python code must avoid bare `except:` blocks, using `except Exception:` instead to comply with `ruff` rule `E722`. This ensures system signals (like `KeyboardInterrupt`) are not inadvertently caught.
3.  **Dependencies**: The `websockets` library (v16.0+) requires explicit import of `websockets.exceptions` to access exception classes like `ConnectionClosed`.

## Backend Dependencies
Backend dependencies are standardized on `pyproject.toml` + `uv.lock` per service.

Current core locations include:
*   `backend/api/pyproject.toml`
*   `backend/ingestion/aviation_poller/pyproject.toml`
*   `backend/ingestion/space_pulse/pyproject.toml`
*   `backend/ingestion/maritime_poller/pyproject.toml`
*   `backend/ingestion/rf_pulse/pyproject.toml`
*   `backend/ingestion/infra_poller/pyproject.toml`
*   `backend/ingestion/gdelt_pulse/pyproject.toml`