import asyncio
import logging
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from routers import system, tracks, analysis, repeaters
from core.database import db
from services.historian import historian_task
from services.broadcast import broadcast_service

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SovereignWatch")

app = FastAPI(title="Sovereign Watch API")

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

# Global task handle
historian_task_handle: asyncio.Task | None = None

@app.on_event("startup")
async def startup():
    global historian_task_handle
    await db.connect()
    
    # Start Historian
    historian_task_handle = asyncio.create_task(historian_task())

    # Start Broadcast Service
    await broadcast_service.start()
    
    logger.info("Database, Redis, Historian, and Broadcast Service started")

@app.on_event("shutdown")
async def shutdown():
    global historian_task_handle
    if historian_task_handle:
        historian_task_handle.cancel()
        try:
            await historian_task_handle
        except asyncio.CancelledError:
            pass

    # Stop Broadcast Service
    await broadcast_service.stop()
            
    await db.disconnect()

# Include Routers
app.include_router(system.router)
app.include_router(tracks.router)
app.include_router(analysis.router)
app.include_router(repeaters.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
