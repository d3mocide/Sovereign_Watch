"""
Space Weather API router — serves NOAA SWPC data cached in Redis.

Endpoints:
  GET /api/space-weather/kp        — current Kp value + 24-hour history
  GET /api/space-weather/aurora    — auroral oval GeoJSON (NOAA 1-hour forecast)
  GET /api/space-weather/status    — quick summary (kp, storm_level, aurora_active)
  GET /api/space-weather/alerts    — NOAA R/S/G scale levels + signal-loss suppression state
"""

import json
import logging
from fastapi import APIRouter, HTTPException
from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.SpaceWeather")


@router.get("/api/space-weather/kp")
async def get_kp():
    """
    Returns current Kp-index and last 24h history series.

    Response:
      {
        "current": { "kp": 3.3, "kp_fraction": 3.33, "storm_level": "unsettled", "time": "...", "fetched_at": "..." },
        "history": [ { "time": "...", "kp": 2.0, "storm_level": "quiet" }, ... ]
      }
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        current_raw = await db.redis_client.get("space_weather:kp_current")
        history_raw = await db.redis_client.get("space_weather:kp_history")

        current = json.loads(current_raw) if current_raw else None
        history = json.loads(history_raw) if history_raw else []

        return {"current": current, "history": history}
    except Exception as e:
        logger.error("Failed to fetch Kp data: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/space-weather/aurora")
async def get_aurora():
    """
    Returns NOAA 1-hour auroral oval forecast as a GeoJSON FeatureCollection.

    Each feature is a Point with property `aurora` (0–100 intensity percentage).
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        data = await db.redis_client.get("space_weather:aurora_geojson")
        if data:
            return json.loads(data)
        return {"type": "FeatureCollection", "features": []}
    except Exception as e:
        logger.error("Failed to fetch aurora GeoJSON: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/space-weather/status")
async def get_space_weather_status():
    """
    Quick-summary endpoint for HUD widgets.

    Response:
      {
        "kp": 3.3,
        "storm_level": "unsettled",
        "aurora_active": true,
        "gps_degradation_risk": "low"|"moderate"|"high",
        "time": "2026-03-21T12:00:00Z"
      }
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        current_raw = await db.redis_client.get("space_weather:kp_current")
        if not current_raw:
            return {
                "kp": None,
                "storm_level": "unknown",
                "aurora_active": False,
                "gps_degradation_risk": "unknown",
                "time": None,
            }

        current = json.loads(current_raw)
        kp = current.get("kp", 0)

        # GPS risk thresholds (based on NOAA GPS disruption guidance):
        #   Kp < 5  → low risk
        #   5 ≤ Kp < 7 → moderate (possible L1 GPS issues at high latitudes)
        #   Kp ≥ 7  → high (widespread GPS degradation likely)
        if kp >= 7:
            gps_risk = "high"
        elif kp >= 5:
            gps_risk = "moderate"
        else:
            gps_risk = "low"

        aurora_raw = await db.redis_client.get("space_weather:aurora_geojson")
        aurora_active = False
        if aurora_raw:
            aurora_data = json.loads(aurora_raw)
            # Aurora is "active" if any point has intensity >= 10%
            aurora_active = any(
                f.get("properties", {}).get("aurora", 0) >= 10
                for f in aurora_data.get("features", [])
            )

        return {
            "kp": kp,
            "storm_level": current.get("storm_level", "quiet"),
            "aurora_active": aurora_active,
            "gps_degradation_risk": gps_risk,
            "time": current.get("time"),
        }
    except Exception as e:
        logger.error("Failed to get space weather status: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/space-weather/alerts")
async def get_space_weather_alerts():
    """
    Returns current NOAA Space Weather Scale levels (R/S/G) and the active
    signal-loss suppression state written by SpaceWeatherSource._poll_noaa_scales().

    Response:
      {
        "scales": { "0": { "R": {...}, "S": {...}, "G": {...} }, ... } | null,
        "suppression": {
          "active": true,
          "reason": "R3 Radio Blackout",
          "r_scale": "R3",
          "g_scale": "G0",
          "expires_at": "...",
          "set_at": "..."
        } | null,
        "fetched_at": "..."
      }
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        scales_raw      = await db.redis_client.get("space_weather:noaa_scales")
        suppression_raw = await db.redis_client.get("space_weather:suppress_signal_loss")

        from datetime import datetime, UTC
        return {
            "scales":      json.loads(scales_raw)      if scales_raw      else None,
            "suppression": json.loads(suppression_raw) if suppression_raw else None,
            "fetched_at":  datetime.now(UTC).isoformat(),
        }
    except Exception as e:
        logger.error("Failed to fetch space weather alerts: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")
