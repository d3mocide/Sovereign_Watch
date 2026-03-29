import asyncio
import logging
import os
from contextlib import asynccontextmanager

from core.database import db
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from routers import (
    analysis,
    buoys,
    gdelt,
    holding_patterns,
    infra,
    iss,
    jamming,
    maritime,
    news,
    orbital,
    rf,
    satnogs,
    space_weather,
    stats,
    system,
    tracks,
)
from services.broadcast import broadcast_service
from services.historian import historian_task, rf_sites_cleanup_task

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SovereignWatch")


async def _historian_supervisor():
    """
    Wraps historian_task() with automatic restart on crash.

    The historian must keep running as long as the API is up — if Kafka or the
    DB is temporarily unavailable at startup (e.g. Redpanda not yet healthy),
    or if an unexpected error occurs mid-run, the supervisor retries with
    exponential backoff (5 s → 10 s → … capped at 60 s).

    A clean asyncio.CancelledError (lifespan shutdown) is propagated immediately
    without retrying.
    """
    backoff = 5.0
    while True:
        try:
            logger.info("Historian supervisor: starting historian task")
            await historian_task()
            # historian_task returned without exception — this only happens if it
            # exits cleanly after handling a CancelledError internally (shouldn't
            # occur after the re-raise fix, but guard anyway).
            logger.info("Historian supervisor: historian exited cleanly")
            break
        except asyncio.CancelledError:
            logger.info("Historian supervisor: cancelled, shutting down")
            raise
        except Exception as e:
            logger.error(
                f"Historian supervisor: historian crashed ({e}). "
                f"Restarting in {backoff:.0f}s..."
            )
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60.0)


# Global task handles
historian_task_handle: asyncio.Task | None = None
rf_cleanup_task_handle: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    BUG-017: Replaced deprecated @app.on_event("startup") / @app.on_event("shutdown")
    decorators with the modern lifespan context manager pattern (FastAPI >= 0.93).
    """
    global historian_task_handle, rf_cleanup_task_handle
    # --- Startup ---
    await db.connect()
    try:
        if db.pool:
            async with db.pool.acquire() as conn:
                await conn.execute("ALTER EXTENSION timescaledb UPDATE;")
                logger.info("TimescaleDB extension check/update completed")
    except Exception as e:
        logger.warning(f"Failed to auto-update TimescaleDB extension: {e}")

    historian_task_handle = asyncio.create_task(_historian_supervisor())
    rf_cleanup_task_handle = asyncio.create_task(rf_sites_cleanup_task())
    await broadcast_service.start()
    logger.info("Database, Redis, Historian, RF Cleanup, and Broadcast Service started")

    yield

    # --- Shutdown ---
    for handle in (historian_task_handle, rf_cleanup_task_handle):
        if handle:
            handle.cancel()
            try:
                await handle
            except asyncio.CancelledError:
                pass
    await broadcast_service.stop()
    await db.disconnect()


# --- Application ---
app = FastAPI(title="Sovereign Watch API", lifespan=lifespan)


# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)

    # Base security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )

    # Relaxed CSP for Swagger UI / ReDoc
    if request.url.path in ["/docs", "/redoc", "/openapi.json"]:
        # Allow inline scripts/styles for Swagger UI
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
        )
        # Allow framing for these if needed, or keep DENY
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
    else:
        # Relaxed CSP for API endpoints to allow WebSocket connections
        response.headers["Content-Security-Policy"] = (
            "default-src 'self' ws: wss:; frame-ancestors 'none'"
        )
        response.headers["X-Frame-Options"] = "DENY"

    return response


# CORS
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(system.router)
app.include_router(tracks.router)
app.include_router(analysis.router)
app.include_router(rf.router)
app.include_router(orbital.router)
app.include_router(infra.router)
app.include_router(news.router)
app.include_router(space_weather.router)
app.include_router(jamming.router)
app.include_router(holding_patterns.router)
app.include_router(satnogs.router)
app.include_router(gdelt.router)
app.include_router(stats.router)
app.include_router(buoys.router)
app.include_router(maritime.router)
app.include_router(iss.router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
