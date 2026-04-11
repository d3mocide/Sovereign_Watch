import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict

import h3
from core.database import db
from fastapi import APIRouter, HTTPException, Query
from models.schemas import H3RiskCell, H3RiskResponse
from services.gdelt_linkage import (
    GDELT_LINKAGE_REASON,
    build_aot_context,
    derive_cable_relevant_countries_from_index,
    fetch_linked_gdelt_events,
    format_gdelt_linkage_notes,
)
from services.risk_taxonomy import SOURCE_CONFIDENCE, score_to_severity, temporal_weight

router = APIRouter()
logger = logging.getLogger("SovereignWatch.H3Risk")

OMEGA_D = 0.5  # entity density weight
OMEGA_S = 0.3  # GDELT sentiment weight
OMEGA_O = 0.2  # cable-landing outage weight

VALID_RESOLUTIONS = {4, 6, 9}


def _normalize_query_default(value):
    if isinstance(value, (int, float, str)) or value is None:
        return value
    return getattr(value, "default", None)


def _resolve_mission_mode(
    *,
    h3_region: str | None,
    lat: float | None,
    lon: float | None,
    radius_nm: float | None,
) -> dict[str, object] | None:
    h3_region = _normalize_query_default(h3_region)
    lat = _normalize_query_default(lat)
    lon = _normalize_query_default(lon)
    radius_nm = _normalize_query_default(radius_nm)

    has_radius_args = any(value is not None for value in (lat, lon, radius_nm))
    if h3_region and has_radius_args:
        raise HTTPException(status_code=400, detail="Provide either h3_region or lat/lon/radius_nm, not both")
    if has_radius_args and not all(value is not None for value in (lat, lon, radius_nm)):
        raise HTTPException(status_code=400, detail="lat, lon, and radius_nm are required together")
    if h3_region:
        return {"h3_region": str(h3_region)}
    if has_radius_args:
        return {"lat": float(lat), "lon": float(lon), "radius_nm": float(radius_nm)}
    return None


def _mission_cache_suffix(mission_mode: dict[str, object] | None) -> str:
    if mission_mode is None:
        return "global"
    if "h3_region" in mission_mode:
        return f"h3:{mission_mode['h3_region']}"
    return (
        "radius:"
        f"{float(mission_mode['lat']):.4f}:"
        f"{float(mission_mode['lon']):.4f}:"
        f"{float(mission_mode['radius_nm']):.1f}"
    )


def _normalize_country_label(value: str | None) -> str:
    """Normalize country labels for lookup against the cable-country index."""
    if not value:
        return ""
    chars = [char.lower() if char.isalnum() else " " for char in str(value)]
    return " ".join("".join(chars).split())


def _build_outage_cell_map(
    outages_data: Dict,
    cable_index: Dict,
    resolution: int,
    allowed_country_keys: set[str] | None = None,
) -> dict[str, float]:
    """Project outage severity onto H3 cells hosting cable landing points."""
    outage_map: dict[str, float] = defaultdict(float)
    countries = cable_index.get("countries", {}) if isinstance(cable_index, dict) else {}
    for feature in outages_data.get("features", []):
        properties = feature.get("properties", {})
        country_key = _normalize_country_label(properties.get("country") or properties.get("region"))
        if allowed_country_keys is not None and country_key not in allowed_country_keys:
            continue
        country_entry = countries.get(country_key)
        if not country_entry:
            continue
        severity = properties.get("severity")
        if severity is None:
            continue
        severity_norm = max(0.0, min(1.0, float(severity) / 100.0))
        for station in country_entry.get("station_points", []):
            lat = station.get("lat")
            lon = station.get("lon")
            if lat is None or lon is None:
                continue
            cell = h3.latlng_to_cell(float(lat), float(lon), resolution)
            outage_map[cell] = max(outage_map.get(cell, 0.0), severity_norm)
    return outage_map


def _entity_domain(entity_id: str) -> str:
    """Map an entity_id prefix to its temporal decay domain."""
    if entity_id.startswith("mmsi-"):
        return "TAK_AIS"
    if entity_id.startswith("icao-"):
        return "TAK_ADSB"
    if entity_id.startswith("SAT-"):
        return "orbital"
    return "default"


@router.get("/api/h3/risk", response_model=H3RiskResponse)
async def get_h3_risk(
    resolution: int = Query(default=6, description="H3 resolution (4, 6, or 9)"),
    hours: int = Query(default=24, ge=1, le=168, description="Lookback window in hours"),
    h3_region: str | None = Query(default=None, description="Optional mission H3 cell for scoped risk analysis"),
    lat: float | None = Query(default=None, description="Optional center latitude for mission risk analysis"),
    lon: float | None = Query(default=None, description="Optional center longitude for mission risk analysis"),
    radius_nm: float | None = Query(default=None, gt=0, description="Optional radius in nautical miles for mission risk analysis"),
):
    """
    Returns H3-indexed composite risk scores for all active cells.

    Risk score C = ω_D · Density_norm + ω_S · Sentiment_norm
    where ω_D=0.6 (entity density) and ω_S=0.4 (GDELT Goldstein sentiment).
    Scores are normalized to [0, 1]; 0 = stable (green), 1 = critical (red).
    """
    if resolution not in VALID_RESOLUTIONS:
        resolution = 6

    mission_mode = _resolve_mission_mode(h3_region=h3_region, lat=lat, lon=lon, radius_nm=radius_nm)
    cache_key = f"h3:risk:{resolution}:{hours}:{_mission_cache_suffix(mission_mode)}"
    if db.redis_client:
        cached = await db.redis_client.get(cache_key)
        if cached:
            data = json.loads(cached)
            return H3RiskResponse(**data)

    aot_context = build_aot_context(**mission_mode) if mission_mode else None
    source_scope = None

    # --- Density: temporally-weighted entity positions per H3 cell ---
    # Each track's contribution is weighted by exponential decay so that recent
    # positions count more than positions from earlier in the lookback window.
    density_map: dict[str, float] = defaultdict(float)
    async with db.pool.acquire() as conn:
                if mission_mode is None or aot_context is None:
                        rows = await conn.fetch(
                                """
                                SELECT time, entity_id, lat, lon FROM tracks
                                WHERE time > NOW() - ($1 || ' hours')::INTERVAL
                                    AND lat IS NOT NULL AND lon IS NOT NULL
                                """,
                                str(hours),
                        )
                else:
                        rows = await conn.fetch(
                                f"""
                                SELECT time, entity_id, lat, lon FROM tracks
                                WHERE time > NOW() - ($1 || ' hours')::INTERVAL
                                    AND lat IS NOT NULL AND lon IS NOT NULL
                                    AND {aot_context.aot_filter_sql.replace('geom', 'ST_SetSRID(ST_MakePoint(lon, lat), 4326)')}
                                """,
                                str(hours),
                                *aot_context.aot_sql_params,
                        )
    for row in rows:
        cell = h3.latlng_to_cell(row["lat"], row["lon"], resolution)
        domain = _entity_domain(row["entity_id"])
        density_map[cell] += temporal_weight(row["time"], domain)

    # --- Sentiment: source-confidence-weighted Goldstein average per H3 cell ---
    # Goldstein range: -10 (destabilising) to +10 (stabilising).
    # Each event's contribution is weighted by its quad_class reliability coefficient
    # so that high-confidence conflict reports outweigh low-credibility verbal signals.
    # Accumulate (weighted_goldstein_sum, total_weight) tuples per cell.
    sentiment_map: dict[str, list[tuple[float, float]]] = defaultdict(list)
    async with db.pool.acquire() as conn:
        if mission_mode is None:
            rows = await conn.fetch(
                """
                SELECT lat, lon, goldstein, quad_class FROM gdelt_events
                WHERE time > NOW() - ($1 || ' hours')::INTERVAL
                  AND lat IS NOT NULL AND lon IS NOT NULL
                  AND goldstein IS NOT NULL
                """,
                str(hours),
            )
            for row in rows:
                cell = h3.latlng_to_cell(row["lat"], row["lon"], resolution)
                quad = row["quad_class"] if row["quad_class"] is not None else 0
                conf_key = "gdelt_conflict" if quad in (3, 4) else "gdelt_verbal"
                weight = SOURCE_CONFIDENCE[conf_key]
                sentiment_map[cell].append((float(row["goldstein"]), weight))
        else:
            linkage_result = await fetch_linked_gdelt_events(
                conn,
                db.redis_client,
                lookback_hours=hours,
                **mission_mode,
            )
            for event in linkage_result.events:
                event_lat = event.get("event_latitude")
                event_lon = event.get("event_longitude")
                goldstein = event.get("goldstein")
                if event_lat is None or event_lon is None or goldstein is None:
                    continue
                cell = h3.latlng_to_cell(float(event_lat), float(event_lon), resolution)
                quad = event.get("quad_class") if event.get("quad_class") is not None else 0
                conf_key = "gdelt_conflict" if quad in (3, 4) else "gdelt_verbal"
                weight = SOURCE_CONFIDENCE[conf_key]
                linkage_score = event.get("linkage_score")
                score_multiplier = 1.0
                if isinstance(linkage_score, (int, float)):
                    score_multiplier = max(0.0, min(1.0, float(linkage_score)))
                sentiment_map[cell].append((float(goldstein) * score_multiplier, weight))

            source_scope = {
                "scope": (
                    "impact_linked_external"
                    if sum(linkage_result.linkage_counts.values()) > linkage_result.linkage_counts["in_aot"]
                    and linkage_result.linkage_counts["in_aot"] == 0
                    else "mission_area"
                ),
                "linkage_reason": GDELT_LINKAGE_REASON,
                "lookback_hours": hours,
                "notes": format_gdelt_linkage_notes(linkage_result.linkage_counts),
            }

    outage_map: dict[str, float] = {}
    if db.redis_client:
        outages_raw = await db.redis_client.get("infra:outages")
        cable_index_raw = await db.redis_client.get("infra:cable_country_index")
        cables_raw = await db.redis_client.get("infra:cables") if mission_mode is not None else None
        if outages_raw and cable_index_raw:
            try:
                allowed_country_keys = None
                if mission_mode is not None and aot_context is not None and cables_raw:
                    cable_countries = derive_cable_relevant_countries_from_index(
                        json.loads(cable_index_raw),
                        json.loads(cables_raw),
                        aot_context.region_lat,
                        aot_context.region_lon,
                    )
                    allowed_country_keys = {
                        _normalize_country_label(country_name) for country_name in cable_countries
                    }
                outage_map = _build_outage_cell_map(
                    json.loads(outages_raw),
                    json.loads(cable_index_raw),
                    resolution,
                    allowed_country_keys=allowed_country_keys,
                )
            except Exception as exc:
                logger.warning("H3 outage projection failed: %s", exc)

    # --- Merge cells from both sources ---
    all_cells = set(density_map.keys()) | set(sentiment_map.keys()) | set(outage_map.keys())
    if not all_cells:
        return H3RiskResponse(
            cells=[],
            resolution=resolution,
            generated_at=datetime.now(timezone.utc).isoformat(),
            source_scope=source_scope,
        )

    max_density = max(density_map.values(), default=1)

    result_cells: list[H3RiskCell] = []
    for cell in all_cells:
        raw_density = density_map.get(cell, 0)
        density_norm = raw_density / max_density  # 0–1

        raw_sentiment = sentiment_map.get(cell, [])
        if raw_sentiment:
            total_weight = sum(w for _, w in raw_sentiment)
            if total_weight > 0:
                avg_goldstein = sum(g * w for g, w in raw_sentiment) / total_weight
            else:
                avg_goldstein = sum(g for g, _ in raw_sentiment) / len(raw_sentiment)
            # Invert: negative Goldstein (conflict) → high risk (1.0)
            sentiment_norm = (10.0 - avg_goldstein) / 20.0
        else:
            sentiment_norm = 0.5  # neutral when no GDELT data for this cell

        outage_norm = outage_map.get(cell, 0.0)

        risk_score = OMEGA_D * density_norm + OMEGA_S * sentiment_norm + OMEGA_O * outage_norm
        risk_score = round(max(0.0, min(1.0, risk_score)), 4)

        lat, lon = h3.cell_to_latlng(cell)
        result_cells.append(
            H3RiskCell(
                cell=cell,
                lat=lat,
                lon=lon,
                density=round(density_norm, 4),
                sentiment=round(sentiment_norm, 4),
                outage=round(outage_norm, 4),
                risk_score=risk_score,
                severity=score_to_severity(risk_score),
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
        source_scope=source_scope,
    )

    if db.redis_client:
        await db.redis_client.setex(cache_key, 30, response.model_dump_json())

    return response
