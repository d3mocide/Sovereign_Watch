import json
import logging
from fastapi import APIRouter, HTTPException, Query
from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.RF")


@router.get("/api/rf/sites")
async def get_rf_sites(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_nm: float = Query(default=150.0, ge=1, le=2500),
    services: list[str] = Query(default=[]),
    modes: list[str] = Query(default=[]),
    emcomm_only: bool = Query(default=False),
    source: str | None = Query(default=None),
):
    radius_m = radius_nm * 1852.0
    cache_key = f"rf_sites:{lat:.2f}:{lon:.2f}:{int(radius_nm)}:{','.join(sorted(services))}:{','.join(sorted(modes))}:{emcomm_only}:{source}"

    if db.redis_client:
        cached = await db.redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

    if not db.pool:
        raise HTTPException(status_code=503, detail="Database connection not available")

    conditions = ["ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)"]
    params = [lat, lon, radius_m]

    if services:
        conditions.append(f"service = ANY(${len(params)+1}::text[])")
        params.append(services)

    if modes:
        conditions.append(f"modes && ${len(params)+1}::text[]")
        params.append(modes)

    if emcomm_only:
        conditions.append("array_length(emcomm_flags, 1) > 0")

    if source:
        conditions.append(f"source = ${len(params)+1}")
        params.append(source)

    where = " AND ".join(conditions)

    # We must explicitly cast to JSON to handle PostGIS geometry and asyncpg Record types
    query = f"""
        SELECT
            id, source, site_id, service, callsign, name, lat, lon,
            output_freq, input_freq, tone_ctcss, tone_dcs, modes,
            use_access, status, city, state, country, emcomm_flags,
            meta, fetched_at, updated_at
        FROM rf_sites
        WHERE {where}
        ORDER BY geom <-> ST_SetSRID(ST_MakePoint($2,$1), 4326)::geometry
        LIMIT 5000
    """

    rows = await db.pool.fetch(query, *params)

    # Convert asyncpg.Record to dict.
    results = []
    for r in rows:
        d = dict(r)
        # Parse JSONB fields if necessary, but asyncpg often returns strings for JSONB if not configured,
        # or dict if json codec is set.
        if isinstance(d.get('meta'), str):
            d['meta'] = json.loads(d['meta'])

        # Ensure UUID and DateTime are serializable
        d['id'] = str(d['id'])
        if d.get('fetched_at'):
            d['fetched_at'] = d['fetched_at'].isoformat()
        if d.get('updated_at'):
            d['updated_at'] = d['updated_at'].isoformat()

        results.append(d)

    response = {"count": len(results), "results": results}

    if db.redis_client:
        await db.redis_client.setex(cache_key, 3600, json.dumps(response, default=str))

    return response


@router.get("/api/repeaters")
async def repeaters_alias(
    lat: float = Query(...),
    lon: float = Query(...),
    radius: float = Query(default=75.0)
):
    """Alias for backwards compatibility. Converts miles to NM."""
    radius_nm = radius * 0.868976
    return await get_rf_sites(lat=lat, lon=lon, radius_nm=radius_nm, service="ham")
