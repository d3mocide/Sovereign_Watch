import asyncio
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from routers import system, tracks, analysis, rf, orbital
from core.database import db
from services.historian import historian_task
from services.broadcast import broadcast_service

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SovereignWatch")



# Global task handle
historian_task_handle: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    BUG-017: Replaced deprecated @app.on_event("startup") / @app.on_event("shutdown")
    decorators with the modern lifespan context manager pattern (FastAPI >= 0.93).
    """
    global historian_task_handle
    # --- Startup ---
    await db.connect()
    try:
        if db.pool:
            async with db.pool.acquire() as conn:
                await conn.execute("ALTER EXTENSION timescaledb UPDATE;")
                logger.info("TimescaleDB extension check/update completed")
    except Exception as e:
        logger.warning(f"Failed to auto-update TimescaleDB extension: {e}")

    historian_task_handle = asyncio.create_task(historian_task())
    await broadcast_service.start()
    logger.info("Database, Redis, Historian, and Broadcast Service started")

    yield

    # --- Shutdown ---
    if historian_task_handle:
        historian_task_handle.cancel()
        try:
            await historian_task_handle
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
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    # Relaxed CSP for Swagger UI / ReDoc
    if request.url.path in ["/docs", "/redoc", "/openapi.json"]:
        # Allow inline scripts/styles for Swagger UI
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
        # Allow framing for these if needed, or keep DENY
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
    else:
        # Strict CSP for API endpoints
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        response.headers["X-Frame-Options"] = "DENY"

    return response

# CORS
ALLOWED_ORIGINS = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")]

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
