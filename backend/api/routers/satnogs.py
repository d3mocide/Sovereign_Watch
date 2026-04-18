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
import re
import time
import httpx
from fastapi import APIRouter, HTTPException, Query
from core.database import db

router = APIRouter(prefix="/api/satnogs", tags=["satnogs"])
logger = logging.getLogger("SovereignWatch.SatNOGS")

CACHE_TTL_TRANSMITTERS = 3600  # 1 hour — transmitter catalog changes rarely
CACHE_TTL_OBSERVATIONS = 300  # 5 minutes — observations arrive hourly
CACHE_TTL_STATIONS = 300  # 5 minutes — station availability changes frequently
CACHE_TTL_STATIONS_STALE = 3600  # 1 hour fallback when upstream is temporarily down
CACHE_TTL_STATIONS_ERROR = 60  # 1 minute failure backoff to avoid hammering upstream
MAX_STATIONS_BACKOFF = 6 * 3600  # Cap externally requested backoff at 6 hours

_THROTTLE_DETAIL_RE = re.compile(r"expected available in\s+(\d+)\s+seconds", re.IGNORECASE)


def _stations_response(
    stations: list[dict],
    *,
    include_meta: bool,
    source: str,
    stale: bool,
    error: str | None = None,
) -> list[dict] | dict:
    if not include_meta:
        return stations

    meta: dict[str, object] = {
        "source": source,
        "stale": stale,
        "count": len(stations),
        "served_at": int(time.time()),
    }
    if error:
        meta["error"] = error

    return {
        "stations": stations,
        "meta": meta,
    }


def _sanitize_backoff_seconds(raw_seconds: int | None) -> int:
    if raw_seconds is None:
        return CACHE_TTL_STATIONS_ERROR
    return max(CACHE_TTL_STATIONS_ERROR, min(int(raw_seconds), MAX_STATIONS_BACKOFF))


def _extract_retry_after_seconds(response: httpx.Response) -> int:
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return _sanitize_backoff_seconds(int(retry_after))
        except ValueError:
            pass

    try:
        payload = response.json()
    except ValueError:
        payload = None

    if isinstance(payload, dict):
        detail = payload.get("detail")
        if isinstance(detail, str):
            match = _THROTTLE_DETAIL_RE.search(detail)
            if match:
                return _sanitize_backoff_seconds(int(match.group(1)))

    return CACHE_TTL_STATIONS_ERROR


def _build_backoff_payload(*, retry_after_s: int, reason: str) -> str:
    effective_retry_after = _sanitize_backoff_seconds(retry_after_s)
    return json.dumps(
        {
            "reason": reason,
            "retry_after_s": effective_retry_after,
            "backoff_until": int(time.time()) + effective_retry_after,
        }
    )


def _parse_backoff_payload(raw_payload: str | bytes | None) -> dict | None:
    if not raw_payload:
        return None

    try:
        payload = json.loads(raw_payload)
    except (TypeError, json.JSONDecodeError):
        return None

    if not isinstance(payload, dict):
        return None

    return payload


def _empty_stations_response(
    *, include_meta: bool, source: str, error: str
) -> list[dict] | dict:
    return _stations_response(
        [],
        include_meta=include_meta,
        source=source,
        stale=False,
        error=error,
    )


def _normalize_station_status(raw_status: object, online_flag: object) -> str:
    """Normalize SatNOGS station availability labels for UI consistency."""
    if isinstance(online_flag, bool):
        return "online" if online_flag else "offline"

    status = str(raw_status or "").strip().lower()
    if status in {"online", "offline", "testing"}:
        return status
    if status in {"active", "up", "good"}:
        return "online"
    if status in {"down", "bad", "inactive"}:
        return "offline"
    return "unknown"


@router.get("/transmitters")
async def get_transmitters(
    norad_id: str | None = Query(
        default=None, description="Filter by NORAD catalog ID"
    ),
    mode: str | None = Query(
        default=None, description="Filter by modulation mode (FM, BPSK, CW, …)"
    ),
    alive_only: bool = Query(
        default=True, description="Only return transmitters marked alive by SatNOGS"
    ),
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
        await db.redis_client.set(
            cache_key, json.dumps(result, default=str), ex=CACHE_TTL_TRANSMITTERS
        )
    return result


@router.get("/observations")
async def get_observations(
    norad_id: str | None = Query(
        default=None, description="Filter by NORAD catalog ID"
    ),
    ground_station_id: int | None = Query(
        default=None, description="Filter by ground station ID"
    ),
    hours: int = Query(
        default=24, ge=1, le=720, description="Look-back window in hours"
    ),
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
        await db.redis_client.set(
            cache_key, json.dumps(result, default=str), ex=CACHE_TTL_OBSERVATIONS
        )
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
                    match = {
                        "uuid": tx["uuid"],
                        "description": tx["description"],
                        "expected_hz": dl,
                    }
                    break
        verified.append(
            {
                **obs,
                "frequency_match": match,
                "anomaly": obs_freq is not None and match is None,
            }
        )

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
        await db.redis_client.set(
            cache_key, json.dumps(result, default=str), ex=CACHE_TTL_OBSERVATIONS
        )
    return result


@router.get("/stations")
async def get_stations(
    include_offline: bool = Query(
        default=False,
        description="Include offline stations in response",
    ),
    include_meta: bool = Query(
        default=False,
        description="Return response metadata for health diagnostics",
    ),
):
    """Proxy the SatNOGS network stations API to bypass CORS and add caching."""
    cache_key = f"satnogs:stations:all:{include_offline}"
    stale_cache_key = f"{cache_key}:stale"
    error_backoff_key = f"{cache_key}:error"

    # During upstream outages, avoid repeated external calls for a short window.
    if db.redis_client and (backoff_raw := await db.redis_client.get(error_backoff_key)):
        backoff = _parse_backoff_payload(backoff_raw) or {}
        retry_after_s = max(
            1,
            int(backoff.get("backoff_until", time.time()) - time.time()),
        )
        stale = await db.redis_client.get(stale_cache_key)
        if stale:
            logger.warning(
                "Serving stale SatNOGS stations during upstream backoff "
                "(include_offline=%s, retry_after_s=%s)",
                include_offline,
                retry_after_s,
            )
            return _stations_response(
                json.loads(stale),
                include_meta=include_meta,
                source="stale_backoff",
                stale=True,
            )
        raise HTTPException(
            status_code=503,
            detail=(
                "SatNOGS stations temporarily unavailable "
                f"(upstream backoff active, retry in {retry_after_s}s)"
            ),
        )

    if db.redis_client:
        cached = await db.redis_client.get(cache_key)
        if cached:
            return _stations_response(
                json.loads(cached),
                include_meta=include_meta,
                source="cache",
                stale=False,
            )

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
                    normalized_status = _normalize_station_status(
                        s.get("status"),
                        s.get("online"),
                    )
                    if not include_offline and normalized_status == "offline":
                        continue

                    stations.append(
                        {
                            "id": s.get("id"),
                            "name": s.get("name"),
                            "status": normalized_status,
                            "last_seen": s.get("last_seen"),
                            "lat": float(lat),
                            "lon": float(lon),
                            "altitude": float(s.get("alt") or 0),
                        }
                    )

            if db.redis_client:
                payload = json.dumps(stations, default=str)
                await db.redis_client.set(cache_key, payload, ex=CACHE_TTL_STATIONS)
                await db.redis_client.set(
                    stale_cache_key,
                    payload,
                    ex=CACHE_TTL_STATIONS_STALE,
                )
                await db.redis_client.delete(error_backoff_key)

            return _stations_response(
                stations,
                include_meta=include_meta,
                source="live",
                stale=False,
            )

    except httpx.HTTPStatusError as exc:
        retry_after_s = (
            _extract_retry_after_seconds(exc.response)
            if exc.response.status_code == 429
            else CACHE_TTL_STATIONS_ERROR
        )
        if db.redis_client:
            await db.redis_client.set(
                error_backoff_key,
                _build_backoff_payload(
                    retry_after_s=retry_after_s,
                    reason="http_429" if exc.response.status_code == 429 else "http_error",
                ),
                ex=retry_after_s,
            )
            stale = await db.redis_client.get(stale_cache_key)
            if stale:
                logger.warning(
                    "SatNOGS upstream HTTP %s, serving stale stations "
                    "(include_offline=%s, retry_after_s=%s)",
                    exc.response.status_code,
                    include_offline,
                    retry_after_s,
                )
                return _stations_response(
                    json.loads(stale),
                    include_meta=include_meta,
                    source=(
                        "stale_rate_limited"
                        if exc.response.status_code == 429
                        else "stale_http_error"
                    ),
                    stale=True,
                )

        logger.error(
            "Failed to fetch SatNOGS stations due to upstream HTTP status "
            "(status=%s, include_offline=%s, retry_after_s=%s)",
            exc.response.status_code,
            include_offline,
            retry_after_s,
            exc_info=True,
        )
        return _empty_stations_response(
            include_meta=include_meta,
            source=(
                "upstream_rate_limited"
                if exc.response.status_code == 429
                else "upstream_http_error"
            ),
            error=(
                f"SatNOGS upstream rate limited requests; retry in {retry_after_s}s"
                if exc.response.status_code == 429
                else "Failed to fetch upstream SatNOGS network stations"
            ),
        )

    except httpx.HTTPError as exc:
        if db.redis_client:
            await db.redis_client.set(
                error_backoff_key,
                _build_backoff_payload(
                    retry_after_s=CACHE_TTL_STATIONS_ERROR,
                    reason="network_error",
                ),
                ex=CACHE_TTL_STATIONS_ERROR,
            )
            stale = await db.redis_client.get(stale_cache_key)
            if stale:
                logger.warning(
                    "SatNOGS upstream network error (%s), serving stale stations "
                    "(include_offline=%s)",
                    type(exc).__name__,
                    include_offline,
                )
                return _stations_response(
                    json.loads(stale),
                    include_meta=include_meta,
                    source="stale_network_error",
                    stale=True,
                )

        logger.error(
            "Failed to fetch SatNOGS stations due to upstream network error "
            "(error_type=%s, include_offline=%s)",
            type(exc).__name__,
            include_offline,
            exc_info=True,
        )
        return _empty_stations_response(
            include_meta=include_meta,
            source="upstream_network_error",
            error="Failed to fetch upstream SatNOGS network stations",
        )
