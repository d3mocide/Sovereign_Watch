import json
import logging
from collections import defaultdict
from datetime import datetime, timezone

import h3
from core.database import db
from fastapi import APIRouter, Query
from models.schemas import H3RiskCell, H3RiskResponse

router = APIRouter()
logger = logging.getLogger("SovereignWatch.H3Risk")

OMEGA_D = 0.6  # entity density weight
OMEGA_S = 0.4  # GDELT sentiment weight

VALID_RESOLUTIONS = {4, 6, 9}


@router.get("/api/h3/risk", response_model=H3RiskResponse)
async def get_h3_risk(
    resolution: int = Query(default=6, description="H3 resolution (4, 6, or 9)"),
    hours: int = Query(default=24, ge=1, le=168, description="Lookback window in hours"),
):
    """
    Returns H3-indexed composite risk scores for all active cells.

    Risk score C = ω_D · Density_norm + ω_S · Sentiment_norm
    where ω_D=0.6 (entity density) and ω_S=0.4 (GDELT Goldstein sentiment).
    Scores are normalized to [0, 1]; 0 = stable (green), 1 = critical (red).
    """
    if resolution not in VALID_RESOLUTIONS:
        resolution = 6

    cache_key = f"h3:risk:{resolution}:{hours}"
    if db.redis_client:
        cached = await db.redis_client.get(cache_key)
        if cached:
            data = json.loads(cached)
            return H3RiskResponse(**data)

    # --- Density: count entity positions per H3 cell in the lookback window ---
    density_map: dict[str, int] = defaultdict(int)
    async with db.pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT lat, lon FROM tracks
            WHERE time > NOW() - ($1 || ' hours')::INTERVAL
              AND lat IS NOT NULL AND lon IS NOT NULL
            """,
            str(hours),
        )
    for row in rows:
        cell = h3.latlng_to_cell(row["lat"], row["lon"], resolution)
        density_map[cell] += 1

    # --- Sentiment: average Goldstein scale per H3 cell ---
    # Goldstein range: -10 (destabilising) to +10 (stabilising)
    sentiment_map: dict[str, list[float]] = defaultdict(list)
    async with db.pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT lat, lon, goldstein FROM gdelt_events
            WHERE time > NOW() - ($1 || ' hours')::INTERVAL
              AND lat IS NOT NULL AND lon IS NOT NULL
              AND goldstein IS NOT NULL
            """,
            str(hours),
        )
    for row in rows:
        cell = h3.latlng_to_cell(row["lat"], row["lon"], resolution)
        sentiment_map[cell].append(float(row["goldstein"]))

    # --- Merge cells from both sources ---
    all_cells = set(density_map.keys()) | set(sentiment_map.keys())
    if not all_cells:
        return H3RiskResponse(
            cells=[],
            resolution=resolution,
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    max_density = max(density_map.values(), default=1)

    result_cells: list[H3RiskCell] = []
    for cell in all_cells:
        raw_density = density_map.get(cell, 0)
        density_norm = raw_density / max_density  # 0–1

        raw_sentiment = sentiment_map.get(cell, [])
        if raw_sentiment:
            avg_goldstein = sum(raw_sentiment) / len(raw_sentiment)
            # Invert: negative Goldstein (conflict) → high risk (1.0)
            sentiment_norm = (10.0 - avg_goldstein) / 20.0
        else:
            sentiment_norm = 0.5  # neutral when no GDELT data for this cell

        risk_score = OMEGA_D * density_norm + OMEGA_S * sentiment_norm
        risk_score = round(max(0.0, min(1.0, risk_score)), 4)

        lat, lon = h3.cell_to_latlng(cell)
        result_cells.append(
            H3RiskCell(
                cell=cell,
                lat=lat,
                lon=lon,
                density=round(density_norm, 4),
                sentiment=round(sentiment_norm, 4),
                risk_score=risk_score,
            )
        )

    # --- Persist snapshot to TimescaleDB ---
    now_ts = datetime.now(timezone.utc)
    try:
        async with db.pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO h3_risk_scores
                    (time, h3_index, resolution, density_raw, sentiment_raw, risk_score, lat, lon)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT DO NOTHING
                """,
                [
                    (
                        now_ts,
                        c.cell,
                        resolution,
                        c.density,
                        c.sentiment,
                        c.risk_score,
                        c.lat,
                        c.lon,
                    )
                    for c in result_cells
                ],
            )
    except Exception as exc:
        logger.warning("H3 risk persistence failed: %s", exc)

    response = H3RiskResponse(
        cells=result_cells,
        resolution=resolution,
        generated_at=now_ts.isoformat(),
    )

    if db.redis_client:
        await db.redis_client.setex(cache_key, 30, response.model_dump_json())

    return response
