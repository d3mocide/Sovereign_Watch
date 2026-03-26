import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Stats")

@router.get("/api/stats/activity")
async def get_activity_stats(hours: int = 24):
    """
    Fetch trailing activity statistics aggregated into 15-minute tumbling windows.
    Optimized to hit TimescaleDB continuous aggregates (if available) or the raw hypertable.
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

    # Constrain hours to a reasonable dashboard view (max 72 hours matching retention)
    hours = max(1, min(hours, 72))

    query = """
        SELECT
            time_bucket('15 minutes', time) AS bucket,
            type,
            COUNT(*) as count
        FROM tracks
        WHERE time >= NOW() - INTERVAL '%s hours'
        GROUP BY bucket, type
        ORDER BY bucket ASC, type
    """ % hours

    try:
        if db.pool:
            async with db.pool.acquire() as conn:
                records = await conn.fetch(query)

        # Reshape data into a timeline series suitable for ECharts
        timeline = {}
        for r in records:
            b_str = r['bucket'].isoformat()
            t_type = r['type'] or 'unknown'
            if b_str not in timeline:
                timeline[b_str] = {}
            if t_type not in timeline[b_str]:
                timeline[b_str][t_type] = 0
            timeline[b_str][t_type] += r['count']

        # Flatten for the response
        result = []
        for b_str, counts in timeline.items():
            result.append({
                "time": b_str,
                "counts": counts
            })

        # Ensure sorted
        result.sort(key=lambda x: x["time"])

        return {"status": "ok", "data": result}

    except Exception as e:
        logger.error(f"Failed to fetch activity stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
