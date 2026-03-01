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
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

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
    params = {
        "lat": lat,
        "lng": lon,
        "dist": int(radius),
        "format": "json",
    }

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(REPEATERBOOK_BASE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="RepeaterBook API timeout")
    except httpx.HTTPStatusError as exc:
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
        coords = entry.get("Coordinates") or {}
        try:
            r_lat = float(coords.get("Latitude", 0))
            r_lon = float(coords.get("Longitude", 0))
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

    return {"count": len(repeaters), "results": repeaters}
