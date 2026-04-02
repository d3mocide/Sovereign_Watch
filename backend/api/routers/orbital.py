"""
Orbital pass prediction endpoints.

GET /api/orbital/passes
    Returns upcoming satellite passes for an observer location.

GET /api/orbital/groundtrack/{norad_id}
    Returns the sub-satellite ground track for one orbit.
"""
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from sgp4.api import Satrec, jday

from utils.sgp4_utils import (
    teme_to_ecef,
    ecef_to_lla_vectorized,
    geodetic_to_ecef,
    ecef_to_topocentric,
)
from core.database import db
import numpy as np

logger = logging.getLogger("SovereignWatch")
router = APIRouter(prefix="/api/orbital", tags=["orbital"])

PASSES_CACHE_TTL = 300  # 5 minutes


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _jday_from_datetime(dt: datetime):
    """Return (jd, fr) tuple from a UTC datetime."""
    return jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1e6)


async def _load_satellites(
    pool,
    norad_ids: Optional[list[str]],
    category: Optional[str] = None,
    constellation: Optional[str] = None,
) -> list[dict]:
    """Fetch TLE rows from the satellites table."""
    async with pool.acquire() as conn:
        if norad_ids:
            rows = await conn.fetch(
                "SELECT norad_id, name, category, constellation, tle_line1, tle_line2 "
                "FROM satellites WHERE norad_id = ANY($1::text[])",
                norad_ids,
            )
        elif constellation:
            rows = await conn.fetch(
                "SELECT norad_id, name, category, constellation, tle_line1, tle_line2 "
                "FROM satellites WHERE LOWER(constellation) = LOWER($1)",
                constellation,
            )
        elif category:
            rows = await conn.fetch(
                "SELECT norad_id, name, category, constellation, tle_line1, tle_line2 "
                "FROM satellites WHERE LOWER(category) = LOWER($1)",
                category,
            )
        else:
            rows = await conn.fetch(
                "SELECT norad_id, name, category, constellation, tle_line1, tle_line2 FROM satellites"
            )
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/passes")
async def get_passes(
    lat: float = Query(..., description="Observer latitude (degrees)"),
    lon: float = Query(..., description="Observer longitude (degrees)"),
    hours: int = Query(6, ge=1, le=48, description="Prediction window in hours"),
    min_elevation: float = Query(10.0, ge=0.0, le=90.0, description="Minimum AOS elevation (degrees)"),
    norad_ids: Optional[str] = Query(None, description="Comma-separated NORAD IDs to filter"),
    category: Optional[str] = Query(None, description="Satellite category to filter (e.g. gps, weather, comms, intel)"),
    constellation: Optional[str] = Query(None, description="Constellation to filter (e.g. Starlink, OneWeb, Iridium)"),
    limit: Optional[int] = Query(None, ge=1, le=500, description="Max passes to return (sorted by AOS)"),
):
    """
    Predict upcoming satellite passes for an observer location.

    Returns a list of passes sorted by AOS, each including a 10-second
    points[] array suitable for Doppler and polar-plot rendering.

    Results are cached in Redis for 5 minutes keyed by
    lat:lon:hours:min_elevation:norad_ids:limit.
    """
    pool = db.pool
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Build cache key — round lat/lon to 3 dp so nearby requests share the cache
    cache_key = (
        f"orbital:passes:{round(lat, 3)}:{round(lon, 3)}"
        f":{hours}:{min_elevation}:{norad_ids or ''}:{category or ''}:{limit or ''}"
    )
    if db.redis_client:
        try:
            cached = await db.redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as exc:
            logger.warning("Redis cache read failed for %s: %s", cache_key, exc)

    # Safety guard: the 'comms' category includes Starlink, OneWeb, Iridium, and
    # amateur constellations — up to 10k satellites in a single query.  Computing
    # SGP4 passes for that many sats in one request will saturate the server and
    # OOM the process.  Category-level queries are allowed for smaller populations
    # (gps, weather, intel) but we hard-reject comms unless a specific NORAD ID
    # list or constellation is also supplied.
    PASS_HEAVY_CATEGORIES = {"comms"}
    if category and category.lower() in PASS_HEAVY_CATEGORIES and not norad_ids and not constellation:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Pass prediction for category '{category}' is not supported without "
                "specifying individual norad_ids or a constellation (e.g. constellation=Starlink). "
                "The comms category is too large for a full scan."
            ),
        )

    norad_filter = [n.strip() for n in norad_ids.split(",")] if norad_ids else None
    satellites = await _load_satellites(pool, norad_filter, category, constellation)

    if not satellites:
        return []


    obs_ecef = geodetic_to_ecef(lat, lon)
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=hours)
    step_seconds = 10

    passes = []

    for sat in satellites:
        try:
            satrec = Satrec.twoline2rv(sat["tle_line1"], sat["tle_line2"])
        except Exception:
            continue  # skip malformed TLEs

        # Walk the prediction window at step_seconds intervals
        current_pass_points: list[dict] = []
        in_pass = False
        tca_el = -999.0
        tca_point: Optional[dict] = None

        t = now
        while t <= end:
            jd, fr = _jday_from_datetime(t)
            e, r, _ = satrec.sgp4(jd, fr)
            if e != 0:
                t += timedelta(seconds=step_seconds)
                continue

            r_ecef = teme_to_ecef(r, jd, fr)
            az, el, rng = ecef_to_topocentric(obs_ecef, r_ecef, lat, lon)

            point = {
                "t": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "az": round(az, 2),
                "el": round(el, 2),
                "slant_range_km": round(rng, 3),
            }

            if el >= min_elevation:
                if not in_pass:
                    in_pass = True
                    current_pass_points = []
                    tca_el = el
                    tca_point = point
                else:
                    if el > tca_el:
                        tca_el = el
                        tca_point = point
                current_pass_points.append(point)
            else:
                if in_pass:
                    # Pass just ended — record it
                    in_pass = False
                    if current_pass_points:
                        aos_p = current_pass_points[0]
                        los_p = current_pass_points[-1]

                        # Compute duration
                        aos_dt = datetime.strptime(aos_p["t"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        los_dt = datetime.strptime(los_p["t"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        duration = int((los_dt - aos_dt).total_seconds())

                        passes.append({
                            "norad_id": sat["norad_id"],
                            "name": sat["name"] or sat["norad_id"],
                            "category": sat["category"],
                            "aos": aos_p["t"],
                            "tca": tca_point["t"] if tca_point else aos_p["t"],
                            "los": los_p["t"],
                            "max_elevation": round(tca_el, 2),
                            "aos_azimuth": aos_p["az"],
                            "los_azimuth": los_p["az"],
                            "duration_seconds": duration,
                            "points": current_pass_points,
                        })
                    current_pass_points = []
                    tca_el = -999.0
                    tca_point = None

            t += timedelta(seconds=step_seconds)

        # Handle pass still in progress at end of window
        if in_pass and current_pass_points:
            aos_p = current_pass_points[0]
            los_p = current_pass_points[-1]
            aos_dt = datetime.strptime(aos_p["t"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            los_dt = datetime.strptime(los_p["t"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            duration = int((los_dt - aos_dt).total_seconds())
            passes.append({
                "norad_id": sat["norad_id"],
                "name": sat["name"] or sat["norad_id"],
                "category": sat["category"],
                "aos": aos_p["t"],
                "tca": tca_point["t"] if tca_point else aos_p["t"],
                "los": los_p["t"],
                "max_elevation": round(tca_el, 2),
                "aos_azimuth": aos_p["az"],
                "los_azimuth": los_p["az"],
                "duration_seconds": duration,
                "points": current_pass_points,
            })

    passes.sort(key=lambda p: p["aos"])

    if limit is not None:
        passes = passes[:limit]

    if db.redis_client:
        try:
            await db.redis_client.setex(cache_key, PASSES_CACHE_TTL, json.dumps(passes))
        except Exception as exc:
            logger.warning("Redis cache write failed for %s: %s", cache_key, exc)

    return passes


@router.get("/stats")
async def get_stats():
    """
    Return satellite counts grouped by category.
    Used by the OrbitalCategoryPills widget to show per-category totals.
    """
    pool = db.pool
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT LOWER(category) AS category, COUNT(*) AS cnt "
            "FROM satellites GROUP BY LOWER(category)"
        )

    # Known primary categories stored in the satellites table
    PRIMARY_CATS = {"gps", "weather", "comms", "intel"}
    counts: dict[str, int] = {}
    total = 0
    for row in rows:
        cat = row["category"] or "other"
        n = int(row["cnt"])
        # Bucket everything not in the primary set into "other"
        bucket = cat if cat in PRIMARY_CATS else "other"
        counts[bucket] = counts.get(bucket, 0) + n
        total += n

    return {
        "gps":    counts.get("gps", 0),
        "weather": counts.get("weather", 0),
        "comms":  counts.get("comms", 0),
        "intel":  counts.get("intel", 0),
        "other":  counts.get("other", 0),
        "total":  total,
    }


@router.get("/constellation-stats")
async def get_constellation_stats():
    """
    Return satellite counts grouped by constellation.
    Used by the OrbitalCategoryPills widget to show per-constellation breakdowns
    within each category (e.g. Starlink / OneWeb / Iridium within COMMS).
    """
    pool = db.pool
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT LOWER(category) AS category, constellation, COUNT(*) AS cnt "
            "FROM satellites "
            "WHERE constellation IS NOT NULL "
            "GROUP BY LOWER(category), constellation "
            "ORDER BY LOWER(category), cnt DESC"
        )

    result: dict[str, dict[str, int]] = {}
    for row in rows:
        cat = row["category"] or "other"
        cst = row["constellation"]
        n = int(row["cnt"])
        result.setdefault(cat, {})[cst] = n

    return result


@router.get("/groundtrack/{norad_id}")
async def get_groundtrack(
    norad_id: str,
    minutes: int = Query(90, ge=1, le=1440, description="Propagation window in minutes"),
    step_seconds: int = Query(30, ge=5, le=300, description="Time step in seconds"),
):
    """
    Return the sub-satellite ground track for one orbit (default 90 min).

    Response: array of {t, lat, lon, alt_km}.
    """
    pool = db.pool
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    satellites = await _load_satellites(pool, [norad_id])
    if not satellites:
        raise HTTPException(status_code=404, detail=f"No TLE found for NORAD ID {norad_id}")

    sat = satellites[0]
    try:
        satrec = Satrec.twoline2rv(sat["tle_line1"], sat["tle_line2"])
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Malformed TLE: {exc}")

    now = datetime.now(timezone.utc)
    end = now + timedelta(minutes=minutes)

    points = []
    t = now
    while t <= end:
        jd, fr = _jday_from_datetime(t)
        e, r, _ = satrec.sgp4(jd, fr)
        if e == 0:
            r_ecef = teme_to_ecef(r, jd, fr)
            # ecef_to_lla_vectorized needs (N, 3)
            lat_arr, lon_arr, alt_arr = ecef_to_lla_vectorized(np.array(r_ecef).reshape(1, 3))
            points.append({
                "t": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "lat": round(float(lat_arr[0]), 5),
                "lon": round(float(lon_arr[0]), 5),
                "alt_km": round(float(alt_arr[0]), 3),
            })
        t += timedelta(seconds=step_seconds)

    return points
