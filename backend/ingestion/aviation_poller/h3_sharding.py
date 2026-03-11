
import logging
import json
import time
from typing import List, Optional
import h3
import redis.asyncio as redis

logger = logging.getLogger("h3_sharding")

class H3PriorityManager:
    """
    Manages H3 geospatial sharding for adaptive aviation polling (Ingest-13).

    Divides the surveillance region into Resolution-4 H3 cells (~1770 km² each,
    ~15nm polling radius per cell). A Redis ZSET priority queue determines which
    cells to poll next:

        Score = next_poll_epoch (Unix timestamp). Lowest score = poll soonest.

    Adaptive intervals:
        - Active cell (≥1 aircraft returned): re-poll in 10 seconds.
        - Empty  cell (0 aircraft returned):  back off to 60 seconds.

    Cell state is also written to a Redis HASH (h3:cell_state) so the
    /api/debug/h3_cells endpoint can serve the FE-09 coverage viz layer.
    """

    # Resolution 2: avg area ~86000 km², avg edge ~158 km, needs ~120nm poll radius.
    RESOLUTION = 2

    # Redis key constants
    KEY_QUEUE  = "h3:poll_queue"       # ZSET  — member=cell, score=next_poll_epoch
    KEY_COUNTS = "h3:aircraft_counts"  # HASH  — field=cell, value=count
    KEY_STATE  = "h3:cell_state"       # HASH  — field=cell, value=json state blob

    # Poll intervals (seconds)
    INTERVAL_ACTIVE = 10
    INTERVAL_EMPTY  = 60

    # Polling radius for a Res-2 cell: edge ~158 km.
    # Use 120 nm for a safety margin.
    CELL_RADIUS_NM = 120

    def __init__(self, redis_url: str = "redis://sovereign-redis:6379"):
        self.redis_url = redis_url
        self.redis: Optional[redis.Redis] = None

    async def start(self):
        self.redis = redis.from_url(self.redis_url, decode_responses=True)
        logger.info("H3PriorityManager connected to Redis")

    async def close(self):
        if self.redis:
            await self.redis.aclose()
            self.redis = None

    async def initialize_region(self, center_lat: float, center_lon: float, radius_km: float):
        """
        Seed the poll queue with all H3 cells covering the target region.

        Uses nx=True so existing cells keep their current priority score
        (a live, active cell won't be bumped back to "poll immediately" on
        a routine re-seed). On a full mission pivot, call flush_region() first.

        k-ring size is derived from radius: k = max(1, floor(radius_km / 158)).
        For a 150 nm (278 km) zone that gives k=1 → 7 cells.
        """
        center_cell = h3.latlng_to_cell(center_lat, center_lon, self.RESOLUTION)
        k = max(1, int(radius_km / 158))
        cells = h3.grid_disk(center_cell, k)

        logger.info(
            f"Seeding H3 poll queue: {len(cells)} cells "
            f"(Res {self.RESOLUTION}, k={k}) for ({center_lat:.3f}, {center_lon:.3f})"
        )

        now = time.time()
        mapping = {cell: now for cell in cells}
        if mapping:
            await self.redis.zadd(self.KEY_QUEUE, mapping, nx=True)

    async def flush_region(self):
        """Delete all H3 queue and state keys (use before a full mission pivot)."""
        await self.redis.delete(self.KEY_QUEUE, self.KEY_COUNTS, self.KEY_STATE)
        logger.info("H3 poll queue flushed")

    async def get_next_batch(self, batch_size: int = 1) -> List[str]:
        """Return up to batch_size cells with the lowest next-poll scores."""
        return await self.redis.zrange(self.KEY_QUEUE, 0, batch_size - 1)

    async def update_priority(self, cell: str, aircraft_count: int):
        """
        Reschedule a cell after a poll completes.

        High traffic  → short interval (poll again in 10 s).
        Empty airspace → long  interval (poll again in 60 s).

        Also publishes cell state for the FE-09 debug layer.
        """
        interval = self.INTERVAL_ACTIVE if aircraft_count > 0 else self.INTERVAL_EMPTY
        next_poll = time.time() + interval

        pipe = self.redis.pipeline()
        pipe.zadd(self.KEY_QUEUE, {cell: next_poll})
        pipe.hset(self.KEY_COUNTS, cell, aircraft_count)
        pipe.hset(
            self.KEY_STATE,
            cell,
            json.dumps({
                "count": aircraft_count,
                "interval_s": interval,
                "next_poll": next_poll,
            }),
        )
        await pipe.execute()

    def get_cell_center_radius(self, cell: str) -> tuple[float, float, int]:
        """Return (lat, lon, radius_nm) for the center of an H3 cell."""
        lat, lon = h3.cell_to_latlng(cell)
        return lat, lon, self.CELL_RADIUS_NM
