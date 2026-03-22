"""
SatNOGS spectrum verification endpoints.

GET /api/satnogs/transmitters
    Returns the known transmitter catalog for satellites, optionally filtered
    by NORAD ID, mode, or frequency range. Used to look up expected downlink
    frequencies for a given satellite.

GET /api/satnogs/observations
    Returns recent ground-station observations, optionally filtered by NORAD ID
    or ground station. Used to verify that satellites were observed transmitting
    on their registered frequencies.

GET /api/satnogs/verify/{norad_id}
    Cross-references the transmitter catalog with recent observations for a
    specific satellite, returning a spectrum verification summary.
"""

import json
import logging
import httpx
from fastapi import APIRouter, HTTPException, Query
from core.database import db

router = APIRouter(prefix="/api/satnogs", tags=["satnogs"])
logger = logging.getLogger("SovereignWatch.SatNOGS")

CACHE_TTL_TRANSMITTERS = 3600   # 1 hour — transmitter catalog changes rarely
CACHE_TTL_OBSERVATIONS = 300    # 5 minutes — observations arrive hourly


@router.get("/transmitters")
async def get_transmitters(
    norad_id: str | None = Query(default=None, description="Filter by NORAD catalog ID"),
    mode: str | None = Query(default=None, description="Filter by modulation mode (FM, BPSK, CW, …)"),
    alive_only: bool = Query(default=True, description="Only return transmitters marked alive by SatNOGS"),
    limit: int = Query(default=500, ge=1, le=5000),
):
    """Return the SatNOGS transmitter catalog (satellite expected frequencies)."""
    cache_key = f"satnogs:tx:{norad_id}:{mode}:{alive_only}:{limit}"
    if db.redis_client:
        cached = await db.redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

    if not db.pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    conditions = []
    params: list = []

    if norad_id:
        conditions.append(f"norad_id = ${len(params) + 1}")
        params.append(norad_id)
    if mode:
        conditions.append(f"LOWER(mode) = LOWER(${len(params) + 1})")
        params.append(mode)
    if alive_only:
        conditions.append("alive = TRUE")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.append(limit)

    query = f"""
        SELECT uuid, norad_id, sat_name, description, alive, type,
               uplink_low, uplink_high, downlink_low, downlink_high,
               mode, invert, baud, status, updated_at
        FROM satnogs_transmitters
        {where}
        ORDER BY updated_at DESC
        LIMIT ${len(params)}
    """

    async with db.pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    result = [dict(r) for r in rows]
    if db.redis_client:
        await db.redis_client.set(cache_key, json.dumps(result, default=str), ex=CACHE_TTL_TRANSMITTERS)
    return result


@router.get("/observations")
async def get_observations(
    norad_id: str | None = Query(default=None, description="Filter by NORAD catalog ID"),
    ground_station_id: int | None = Query(default=None, description="Filter by ground station ID"),
    hours: int = Query(default=24, ge=1, le=720, description="Look-back window in hours"),
    limit: int = Query(default=200, ge=1, le=2000),
):
    """Return recent SatNOGS ground-station observations."""
    cache_key = f"satnogs:obs:{norad_id}:{ground_station_id}:{hours}:{limit}"
    if db.redis_client:
        cached = await db.redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

    if not db.pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    conditions = ["time >= NOW() - ($1 * INTERVAL '1 hour')"]
    params: list = [hours]

    if norad_id:
        conditions.append(f"norad_id = ${len(params) + 1}")
        params.append(norad_id)
    if ground_station_id is not None:
        conditions.append(f"ground_station_id = ${len(params) + 1}")
        params.append(ground_station_id)

    where = "WHERE " + " AND ".join(conditions)
    params.append(limit)

    query = f"""
        SELECT observation_id, norad_id, ground_station_id, transmitter_uuid,
               frequency, mode, status, time AS start_time,
               rise_azimuth, set_azimuth, max_altitude,
               has_audio, has_waterfall, vetted_status, fetched_at
        FROM satnogs_observations
        {where}
        ORDER BY time DESC
        LIMIT ${len(params)}
    """

    async with db.pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    result = [dict(r) for r in rows]
    if db.redis_client:
        await db.redis_client.set(cache_key, json.dumps(result, default=str), ex=CACHE_TTL_OBSERVATIONS)
    return result


@router.get("/verify/{norad_id}")
async def verify_spectrum(norad_id: str):
    """
    Spectrum verification summary for a satellite.

    Returns:
      - known_transmitters: catalog entries from SatNOGS DB
      - recent_observations: last 24h observations from the network
      - verification: for each observation, whether the observed frequency
        matches a known transmitter (within a ±5 kHz tolerance)
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    cache_key = f"satnogs:verify:{norad_id}"
    if db.redis_client:
        cached = await db.redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

    async with db.pool.acquire() as conn:
        tx_rows = await conn.fetch(
            """
            SELECT uuid, sat_name, description, downlink_low, downlink_high,
                   uplink_low, mode, alive, status
            FROM satnogs_transmitters
            WHERE norad_id = $1
            ORDER BY downlink_low NULLS LAST
            """,
            norad_id,
        )
        obs_rows = await conn.fetch(
            """
            SELECT observation_id, ground_station_id, frequency, mode,
                   status, time AS start_time, has_waterfall, vetted_status
            FROM satnogs_observations
            WHERE norad_id = $1 AND time >= NOW() - INTERVAL '24 hours'
            ORDER BY time DESC
            LIMIT 100
            """,
            norad_id,
        )

    transmitters = [dict(r) for r in tx_rows]
    observations = [dict(r) for r in obs_rows]

    FREQ_TOLERANCE_HZ = 5_000  # 5 kHz — accounts for Doppler + crystal variance

    verified = []
    for obs in observations:
        obs_freq = obs.get("frequency")
        match = None
        if obs_freq:
            for tx in transmitters:
                dl = tx.get("downlink_low")
                if dl and abs(obs_freq - dl) <= FREQ_TOLERANCE_HZ:
                    match = {"uuid": tx["uuid"], "description": tx["description"], "expected_hz": dl}
                    break
        verified.append({
            **obs,
            "frequency_match": match,
            "anomaly": obs_freq is not None and match is None,
        })

    result = {
        "norad_id": norad_id,
        "sat_name": transmitters[0]["sat_name"] if transmitters else None,
        "known_transmitters": transmitters,
        "recent_observations": verified,
        "summary": {
            "total_observations": len(verified),
            "matched": sum(1 for o in verified if o["frequency_match"]),
            "anomalous": sum(1 for o in verified if o["anomaly"]),
        },
    }

    if db.redis_client:
        await db.redis_client.set(cache_key, json.dumps(result, default=str), ex=CACHE_TTL_OBSERVATIONS)
    return result


@router.get("/stations")
async def get_stations():
    """Proxy the SatNOGS network stations API to bypass CORS and add caching."""
    cache_key = "satnogs:stations:all"
    if db.redis_client:
        cached = await db.redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

    try:
        headers = {
            "User-Agent": "SovereignWatch/1.0 (admin@sovereignwatch.local)",
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
            resp = await client.get("https://network.satnogs.org/api/stations/")
            resp.raise_for_status()
            
            # The API might return paginated results or a flat list. Usually it's a flat list.
            data = resp.json()
            if isinstance(data, dict) and "results" in data:
                data = data["results"]
                
            # Filter and simplify fields to minimize payload
            stations = []
            for s in data:
                lat = s.get("lat")
                lon = s.get("lng")
                if lat is not None and lon is not None:
                    stations.append({
                        "id": s.get("id"),
                        "name": s.get("name"),
                        "status": s.get("status"),
                        "lat": float(lat),
                        "lon": float(lon),
                        "altitude": float(s.get("alt") or 0)
                    })
                    
            if db.redis_client and stations:
                # Cache for 24 hours (86400 seconds)
                await db.redis_client.set(cache_key, json.dumps(stations, default=str), ex=86400)
                
            return stations

    except Exception as e:
        logger.error(f"Failed to fetch SatNOGS stations: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch upstream SatNOGS network stations")
