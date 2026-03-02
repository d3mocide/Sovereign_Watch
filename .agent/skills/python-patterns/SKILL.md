# Python Patterns - Sovereign Watch

> **CRITICAL:** Sovereign Watch uses Python heavily for its FastAPI backend and Ingestion Pollers.

## Core Rules

1.  **Asynchronous Programming**:
    *   To prevent blocking the `asyncio` event loop in ingestion services, CPU-bound tasks (like `sgp4` TLE parsing) must be offloaded to a thread pool using `asyncio.to_thread`.
    *   The `OrbitalPulseService` in `backend/ingestion/orbital_pulse/service.py` uses `aiofiles` for asynchronous, non-blocking cache file operations.
2.  **Linting (Ruff)**:
    *   Python code must not use multiple statements on a single line (e.g., `if x: return y`) to comply with `ruff` rule `E701`.
    *   Python code must avoid bare `except:` blocks, using `except Exception:` instead to comply with `ruff` rule `E722`. This ensures system signals (like `KeyboardInterrupt`) are not inadvertently caught.
3.  **Dependencies**: The `websockets` library (v16.0+) requires explicit import of `websockets.exceptions` to access exception classes like `ConnectionClosed`.

## Backend Dependencies
Backend dependencies are managed across three distinct locations:
*   `backend/api/requirements.txt`
*   `backend/ingestion/aviation_poller/requirements.txt`
*   `backend/ingestion/orbital_pulse/requirements.txt`