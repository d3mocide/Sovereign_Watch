"""
Cross-Domain Fusion API — Phase 3 Geospatial.

Endpoints:
  GET /api/maritime/risk-assessment?mmsi=&lat=&lon=&radius_nm=100
    Maritime conditions summary: nearby buoy anomaly check plus compatibility
    advisory fields retained from the retired incident-intelligence pipeline.

  GET /api/maritime/sea-state-anomaly?lat=&lon=&radius_nm=100
      NDBC Z-score anomaly scan near a position.  Returns buoys whose current
      significant wave height deviates > 2σ from their rolling hourly baseline.

Both endpoints are read-only PostGIS queries against tables that may be empty
when the pollers haven't run yet; they return safe empty payloads in that case.
"""

import logging

from core.database import db
from fastapi import APIRouter, HTTPException, Query
from models.schemas import score_to_severity

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Maritime")

# ─── helpers ────────────────────────────────────────────────────────────────


def _threat_label(score: float) -> str:
    """Translate a composite 0–10 score to a human-readable threat level."""
    return score_to_severity(score / 10.0, "maritime").value


# ─── risk-assessment ─────────────────────────────────────────────────────────

_SEA_STATE_QUERY = """
SELECT
    latest.buoy_id,
    latest.wvht_m,
    ROUND(
        (ST_Distance(
            latest.geom::geography,
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
        ) / 1852.0)::numeric,
        1
    ) AS distance_nm,
    CASE
        WHEN COALESCE(base.std_wvht_m, 0) > 0
        THEN ROUND(
            ((latest.wvht_m - base.avg_wvht_m) / base.std_wvht_m)::numeric,
            2
        )
        ELSE NULL
    END AS wvht_zscore,
    ROUND(COALESCE(base.avg_wvht_m, latest.wvht_m)::numeric, 2) AS avg_wvht_m
FROM (
    SELECT DISTINCT ON (buoy_id)
        buoy_id, wvht_m, geom
    FROM ndbc_obs
    WHERE geom && ST_Expand(
        ST_SetSRID(ST_MakePoint($2, $1), 4326),
        $3 / 60.0
    )
      AND time > NOW() - INTERVAL '2 hours'
      AND wvht_m IS NOT NULL
    ORDER BY buoy_id, time DESC
) AS latest
LEFT JOIN LATERAL (
    SELECT avg_wvht_m, std_wvht_m
    FROM ndbc_hourly_baseline
    WHERE buoy_id = latest.buoy_id
    ORDER BY hour DESC
    LIMIT 1
) AS base ON true
WHERE ST_DWithin(
    latest.geom::geography,
    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
    $3 * 1852.0
)
ORDER BY distance_nm ASC
LIMIT 10
"""


@router.get("/api/maritime/risk-assessment")
async def get_risk_assessment(
    mmsi: str = Query(..., description="Vessel MMSI"),
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    radius_nm: float = Query(
        default=100.0, ge=1.0, le=500.0, description="Search radius in nautical miles"
    ),
    days: int = Query(
        default=365,
        ge=1,
        le=3650,
        description="Legacy advisory look-back window retained for API compatibility",
    ),
):
    """Return a maritime conditions report for a vessel at (lat, lon).

    The external incident-intelligence feed has been sunset, so the incident
    fields are returned as empty compatibility values while the buoy anomaly
    path remains active.
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    try:
        async with db.pool.acquire() as conn:
            sea_rows = await conn.fetch(_SEA_STATE_QUERY, lat, lon, radius_nm)
    except Exception as exc:
        logger.error("Risk assessment DB error: %s", exc)
        raise HTTPException(status_code=500, detail="Database error")

    _ = days
    incidents: list[dict] = []

    sea_state = [
        {
            "buoy_id": r["buoy_id"],
            "wvht_m": float(r["wvht_m"]) if r["wvht_m"] is not None else None,
            "avg_wvht_m": float(r["avg_wvht_m"])
            if r["avg_wvht_m"] is not None
            else None,
            "wvht_zscore": float(r["wvht_zscore"])
            if r["wvht_zscore"] is not None
            else None,
            "distance_nm": float(r["distance_nm"]),
        }
        for r in sea_rows
    ]

    max_incident_score = 0.0
    sea_anomaly = any(
        s["wvht_zscore"] is not None and abs(s["wvht_zscore"]) > 2.0 for s in sea_state
    )
    composite_score = min(
        10.0,
        round(
            max_incident_score * 0.7 + (2.0 if sea_anomaly else 0.0),
            2,
        ),
    )

    return {
        "mmsi": mmsi,
        "lat": lat,
        "lon": lon,
        "radius_nm": radius_nm,
        "threat_level": _threat_label(composite_score),
        "composite_score": composite_score,
        "incident_max_score": round(max_incident_score, 2),
        "incident_count": len(incidents),
        "nearby_incidents": incidents,
        "sea_state_anomaly": sea_anomaly,
        "sea_state": sea_state,
    }


# ─── sea-state-anomaly ───────────────────────────────────────────────────────

_ANOMALY_ONLY_QUERY = """
SELECT
    latest.buoy_id,
    latest.wvht_m,
    latest.lat,
    latest.lon,
    ROUND(
        (ST_Distance(
            latest.geom::geography,
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
        ) / 1852.0)::numeric,
        1
    ) AS distance_nm,
    CASE
        WHEN COALESCE(base.std_wvht_m, 0) > 0
        THEN ROUND(
            ((latest.wvht_m - base.avg_wvht_m) / base.std_wvht_m)::numeric,
            2
        )
        ELSE NULL
    END AS wvht_zscore,
    ROUND(COALESCE(base.avg_wvht_m, latest.wvht_m)::numeric, 2) AS avg_wvht_m,
    ROUND(COALESCE(base.std_wvht_m, 0)::numeric, 2) AS std_wvht_m
FROM (
    SELECT DISTINCT ON (buoy_id)
        buoy_id, wvht_m, lat, lon, geom
    FROM ndbc_obs
    WHERE geom && ST_Expand(
        ST_SetSRID(ST_MakePoint($2, $1), 4326),
        $3 / 60.0
    )
      AND time > NOW() - INTERVAL '2 hours'
      AND wvht_m IS NOT NULL
    ORDER BY buoy_id, time DESC
) AS latest
LEFT JOIN LATERAL (
    SELECT avg_wvht_m, std_wvht_m
    FROM ndbc_hourly_baseline
    WHERE buoy_id = latest.buoy_id
    ORDER BY hour DESC
    LIMIT 1
) AS base ON true
WHERE ST_DWithin(
    latest.geom::geography,
    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
    $3 * 1852.0
)
  AND CASE
        WHEN COALESCE(base.std_wvht_m, 0) > 0
        THEN ABS((latest.wvht_m - base.avg_wvht_m) / base.std_wvht_m) > 2.0
        ELSE false
      END
ORDER BY ABS(
    CASE WHEN COALESCE(base.std_wvht_m, 0) > 0
         THEN (latest.wvht_m - base.avg_wvht_m) / base.std_wvht_m
         ELSE 0
    END
) DESC
LIMIT 20
"""


@router.get("/api/maritime/sea-state-anomaly")
async def get_sea_state_anomaly(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    radius_nm: float = Query(
        default=100.0, ge=1.0, le=1000.0, description="Search radius in nautical miles"
    ),
):
    """Return NDBC buoys with |Z-score| > 2 within radius_nm of (lat, lon).

    A Z-score > 2 means the current significant wave height (WVHT) is more
    than 2 standard deviations above the rolling hourly baseline — indicative
    of developing storm conditions or unusual sea state.
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    try:
        async with db.pool.acquire() as conn:
            rows = await conn.fetch(_ANOMALY_ONLY_QUERY, lat, lon, radius_nm)
    except Exception as exc:
        logger.error("Sea state anomaly DB error: %s", exc)
        raise HTTPException(status_code=500, detail="Database error")

    anomalies = [
        {
            "buoy_id": r["buoy_id"],
            "lat": float(r["lat"]),
            "lon": float(r["lon"]),
            "wvht_m": float(r["wvht_m"]),
            "avg_wvht_m": float(r["avg_wvht_m"])
            if r["avg_wvht_m"] is not None
            else None,
            "std_wvht_m": float(r["std_wvht_m"])
            if r["std_wvht_m"] is not None
            else None,
            "wvht_zscore": float(r["wvht_zscore"])
            if r["wvht_zscore"] is not None
            else None,
            "distance_nm": float(r["distance_nm"]),
        }
        for r in rows
    ]

    return {
        "lat": lat,
        "lon": lon,
        "radius_nm": radius_nm,
        "anomaly_count": len(anomalies),
        "anomalies": anomalies,
    }
