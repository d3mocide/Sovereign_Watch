import asyncio
import logging
import os
from contextlib import asynccontextmanager

from core.auth import require_role
from core.config import settings
from core.database import db
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from routers import (
    ai_router,
    analysis,
    auth,
    buoys,
    gdelt,
    h3_risk,
    holding_patterns,
    infra,
    iss,
    jamming,
    maritime,
    metrics,
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
from services.log_handler import RedisLogHandler

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

    # Install Redis log handler so all SovereignWatch log records are
    # captured in the ``logs:recent`` list for the Operations dashboard.
    if db.redis_client:
        redis_handler = RedisLogHandler(settings.REDIS_URL)
        logging.getLogger("SovereignWatch").addHandler(redis_handler)
        logger.info("Redis log handler installed")

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
logger.info(f"CORS: Allowed Origins = {ALLOWED_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ── Health check (public — used by Docker/nginx probes) ──────────────────────
@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


# ── Minimum auth gate applied to every data router ───────────────────────────
# require_role("viewer") validates the Bearer token, checks is_active, and
# enforces the lowest privilege tier.  Routers that need higher privileges
# add their own per-endpoint Depends on top of this.
_viewer_auth = [Depends(require_role("viewer"))]

# auth router manages its own per-endpoint auth — no global gate needed.
app.include_router(auth.router)

# system router: /health is served above; all other system endpoints are
# protected by the viewer gate.
app.include_router(system.router, dependencies=_viewer_auth)

# tracks router: handles its own auth for WebSocket endpoints via query-param tokens.
app.include_router(tracks.router)

app.include_router(metrics.router, dependencies=_viewer_auth)
app.include_router(analysis.router, dependencies=_viewer_auth)
app.include_router(rf.router, dependencies=_viewer_auth)
app.include_router(orbital.router, dependencies=_viewer_auth)
app.include_router(infra.router, dependencies=_viewer_auth)
app.include_router(news.router, dependencies=_viewer_auth)
app.include_router(space_weather.router, dependencies=_viewer_auth)
app.include_router(jamming.router, dependencies=_viewer_auth)
app.include_router(holding_patterns.router, dependencies=_viewer_auth)
app.include_router(satnogs.router, dependencies=_viewer_auth)
app.include_router(gdelt.router, dependencies=_viewer_auth)
app.include_router(stats.router)
app.include_router(buoys.router, dependencies=_viewer_auth)
app.include_router(maritime.router, dependencies=_viewer_auth)
app.include_router(iss.router, dependencies=_viewer_auth)
app.include_router(ai_router.router, dependencies=_viewer_auth)
app.include_router(h3_risk.router, dependencies=_viewer_auth)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
