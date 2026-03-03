"""
Repeater Infrastructure Proxy
==============================
Proxies requests to the RepeaterBook.com public API to avoid browser CORS
restrictions and to apply server-side rate limiting.

RepeaterBook API returns licensed amateur radio repeaters with coordinates,
frequency, CTCSS tones, and operational status — useful for RF infrastructure
situational awareness.
"""

import logging
import os
import json
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Repeaters")

REPEATERBOOK_BASE_URL = "https://www.repeaterbook.com/api/export.php"
_HTTP_TIMEOUT = 15.0  # seconds


@router.get("/api/repeaters")
async def get_repeaters(
    lat: float = Query(..., ge=-90, le=90, description="Center latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Center longitude"),
    radius: float = Query(default=75.0, ge=1, le=500, description="Search radius in miles"),
):
    """
    Return amateur radio repeaters near the given coordinates.

    Proxies the RepeaterBook.com public API and normalises the response
    into a compact list of repeater objects for the frontend layer.

    - **lat/lon**: Mission area centre point.
    - **radius**: Search radius in miles (capped at 500 to avoid abuse).
    """
    
    # Create deterministic cache key by rounding to 2 decimal places (approx ~1km)
    cache_key = f"repeaters:lat={lat:.2f}:lon={lon:.2f}:rad={int(radius)}"
    
    # 1. Check Redis Cache
    if db.redis_client:
        try:
            cached_data = await db.redis_client.get(cache_key)
            if cached_data:
                logger.info(f"RepeaterBook Cache HIT: {cache_key}")
                return json.loads(cached_data)
        except Exception as e:
            logger.warning(f"Redis cache read failed for {cache_key}: {e}")

    # 2. Cache MISS — Fetch from external API
    params = {
        "lat": lat,
        "lng": lon,
        "dist": int(radius),
        "format": "json",
    }

    headers = {
        "User-Agent": "SovereignWatch/0.10.4 (admin@sovereignwatch.local)"
    }
    
    token = os.getenv("REPEATERBOOK_API_TOKEN", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=headers) as client:
            resp = await client.get(REPEATERBOOK_BASE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="RepeaterBook API timeout")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 401:
            raise HTTPException(
                status_code=502, # Keep as 502 for the proxy so it matches frontend expectations, but pass detail
                detail="RepeaterBook API requires an auth token. Set REPEATERBOOK_API_TOKEN.",
            )
        raise HTTPException(
            status_code=502,
            detail=f"RepeaterBook API error: {exc.response.status_code}",
        )
    except Exception as exc:
        logger.error("RepeaterBook fetch failed: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to fetch repeater data")

    raw_results = data.get("results", []) or []
    repeaters = []

    for entry in raw_results:
        try:
            r_lat = float(entry.get("Lat", 0))
            r_lon = float(entry.get("Long", 0))
        except (TypeError, ValueError):
            continue

        if r_lat == 0 and r_lon == 0:
            continue

        # Collect active digital modes
        modes = []
        for mode_key in ("FM Analog", "D-Star", "Fusion", "DMR", "P25", "NXDN", "TETRA"):
            val = entry.get(mode_key)
            if val and str(val).strip().lower() not in ("", "no", "null", "none"):
                modes.append(mode_key)

        repeaters.append(
            {
                "callsign": entry.get("Call Sign", ""),
                "lat": r_lat,
                "lon": r_lon,
                "frequency": entry.get("Frequency", ""),
                "input_freq": entry.get("Input Freq", ""),
                "ctcss": entry.get("PL") or entry.get("CTCSS"),
                "use": entry.get("Use", "OPEN"),
                "status": entry.get("Operational Status", ""),
                "city": entry.get("Nearest City", ""),
                "state": entry.get("State", ""),
                "modes": modes,
            }
        )

    response_data = {"count": len(repeaters), "results": repeaters}
    
    # 3. Store in Redis Cache (24 hour TTL)
    if db.redis_client:
        try:
            # 86400 seconds = 24 hours
            await db.redis_client.setex(cache_key, 86400, json.dumps(response_data))
            logger.info(f"RepeaterBook Cache STORED: {cache_key}")
        except Exception as e:
            logger.warning(f"Redis cache write failed for {cache_key}: {e}")

    return response_data
