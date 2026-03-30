import logging
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

        # Filter out the very last bucket if it's potentially incomplete (current bucket)
        if len(result) > 1:
            result = result[:-1]

        return {"status": "ok", "data": result}

    except Exception as e:
        logger.error(f"Failed to fetch activity stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/api/stats/tak-breakdown")
async def get_tak_breakdown():
    """
    Fetch total breakdown of TAK (CoT) types across the system.
    Returns counts and human-readable descriptions for the dashboard.
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

    query = """
        SELECT type, COUNT(*) as count 
        FROM tracks 
        GROUP BY type 
        ORDER BY count DESC
    """

    # Mapping of hierarchical CoT types to human-readable labels and categories
    COT_MAP = {
        "a-f-A-C-F": {"label": "Civilian Fixed Wing", "category": "Aviation", "color": "#7dd3fc"},
        "a-f-A-M-F": {"label": "Military Fixed Wing", "category": "Aviation", "color": "#fb923c"},
        "a-f-A-C-H": {"label": "Civilian Helicopter", "category": "Aviation", "color": "#4ade80"},
        "a-f-A-M-H": {"label": "Military Helicopter", "category": "Aviation", "color": "#facc15"},
        "a-f-A-C-Q": {"label": "Civilian Drone/UAV", "category": "Aviation", "color": "#f8fafc"},
        "a-f-A-M-Q": {"label": "Military Drone/UAV", "category": "Aviation", "color": "#e2e8f0"},
        "a-f-S-C-M": {"label": "Maritime Surface", "category": "Maritime", "color": "#3b82f6"},
        "a-f-G-E-V-C": {"label": "Ground Vehicle", "category": "Terrestrial", "color": "#f472b6"},
        "a-f-O-X-S": {"label": "Orbital Satellite", "category": "Space", "color": "#c084fc"},
    }

    try:
        async with db.pool.acquire() as conn:
            records = await conn.fetch(query)

        breakdown = []
        for r in records:
            t = r['type']
            info = COT_MAP.get(t, {"label": f"Unknown ({t})", "category": "Unclassified", "color": "#4b5563"})
            breakdown.append({
                "type": t,
                "label": info["label"],
                "category": info["category"],
                "color": info["color"],
                "count": r['count']
            })

        return {"status": "ok", "data": breakdown}

    except Exception as e:
        logger.error(f"Failed to fetch TAK breakdown: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/api/stats/throughput")
async def get_throughput_stats():
    """
    Fetch real-time throughput metrics (bytes/sec) and daily totals for all data feeds.
    Data is aggregated by the Historian service and stored in Redis.
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    TOPICS = [
        "adsb_raw", "ais_raw", "orbital_raw", "rf_raw", 
        "satnogs_transmitters", "satnogs_observations", "gdelt_raw"
    ]
    
    # Map topics to the IDs used in the Dashboard UI (canonical IDs)
    # satnogs_transmitters → SatNOGSDBSource (db.satnogs.org) → poller id "satnogs_db"
    # satnogs_observations → SatNOGSNetworkSource (network.satnogs.org) → poller id "satnogs_net"
    TOPIC_TO_ID = {
        "adsb_raw": "adsb",
        "ais_raw": "maritime",
        "orbital_raw": "orbital",
        "rf_raw": "rf_ard",
        "satnogs_transmitters": "satnogs_db",
        "satnogs_observations": "satnogs_net",
        "gdelt_raw": "gdelt"
    }

    try:
        throughput = {}
        total_bandwidth = 0
        
        # Fetch current sec/rate (KB/S) and total daily bytes
        for topic in TOPICS:
            id_key = TOPIC_TO_ID.get(topic, topic)
            
            # Current Rate
            rate_bytes = await db.redis_client.get(f"metrics:throughput:{topic}")
            rate_kb = (float(rate_bytes) / 1024.0) if rate_bytes else 0.0
            
            # Total Daily
            total_bytes = await db.redis_client.get(f"metrics:total_bytes:{topic}")
            total_val = int(total_bytes) if total_bytes else 0
            
            throughput[id_key] = {
                "kb_per_sec": round(rate_kb, 1),
                "total_bytes": total_val
            }
            total_bandwidth += total_val

        return {
            "status": "ok",
            "throughput": throughput,
            "total_bandwidth_mb": round(total_bandwidth / (1024 * 1024), 1)
        }

    except Exception as e:
        logger.error(f"Failed to fetch throughput stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
