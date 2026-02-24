
import logging
import asyncio
import json
import time
from typing import List, Dict, Optional
import h3
import redis.asyncio as redis
from multi_source_poller import MultiSourcePoller

logger = logging.getLogger("h3_sharding")

class H3PriorityManager:
    """
    Manages H3 geospatial sharding (Gap 3).
    - Maintains a Priority Queue of H3 cells in Redis.
    - Tracks aircraft counts per cell to dynamically adjust priority.
    """
    
    def __init__(self, redis_url: str = "redis://sovereign-redis:6379"):
        self.redis_url = redis_url
        self.redis: Optional[redis.Redis] = None
        self.resolution = 4 # Size ~1700km2 (Large regional blocks) - wait, Resolution 7 is ~5km2.
        # Research doc requested Res 7.
        # But for 'polling', if we poll Res 7 (5km), we need THOUSANDS of requests to cover Portland.
        # API takes 'radius_nm'.
        # Strategy: We poll 'Points' which are centers of H3 Cells.
        # If we use Res 4 (Avg edge 22km, Area 1770km2), radius needed is ~25km (~13nm).
        # If we use Res 7 (Avg edge 1.2km, Area 5km2), radius needed is ~2km (~1nm).
        # 13nm radius calls are efficient. 1nm radius calls are wasteful overhead.
        # Let's use Resolution 4 for POLLING aggregation blocks.
        self.resolution = 4
        
        # Redis Key Constants
        self.KEY_QUEUE = "h3:poll_queue"      # ZSET: Member=Cell, Score=Priority (timestamp or weight)
        self.KEY_COUNTS = "h3:aircraft_counts" # HASH: Field=Cell, Value=Count

    async def start(self):
        self.redis = redis.from_url(self.redis_url, decode_responses=True)
        logger.info("Connected to Redis for H3 Priority Management")

    async def initialize_region(self, center_lat: float, center_lon: float, radius_km: float):
        """
        Populate the queue with initial cells covering the target region.
        For Portland (150nm ~ 275km), we need cells covering this circle.
        """
        # h3.grid_disk is simple but we need a cell first
        center_cell = h3.latlng_to_cell(center_lat, center_lon, self.resolution)
        
        # Estimate K-ring size. Edge of Res 4 is ~22km. 275km radius / 22km ~ 12 rings.
        k_ring_size = 12 
        cells = h3.grid_disk(center_cell, k_ring_size)
        
        logger.info(f"Initializing region coverage: {len(cells)} H3 cells (Res {self.resolution})")
        
        # Add all to queue with equal priority (score = 0)
        # Actually, score should be 'next_poll_time'. 
        # ZSET score = timestamp. Lowest score = poll first.
        now = time.time()
        
        # Batch add
        mapping = {cell: now for cell in cells}
        if mapping:
            await self.redis.zadd(self.KEY_QUEUE, mapping, nx=True) # Only add if not exists

    async def get_next_batch(self, batch_size: int = 5) -> List[str]:
        """Get the top N cells due for polling."""
        # Get cells with score < now (or just lowest scores)
        # ZRANGE returns lowest scores first.
        cells = await self.redis.zrange(self.KEY_QUEUE, 0, batch_size - 1)
        return cells

    async def update_priority(self, cell: str, aircraft_count: int):
        """
        Smart Scheduling (Gap 3 Logic):
        - High Traffic (many planes) -> Poll frequently (Short Interval)
        - Low Traffic (0 planes) -> Poll rarely (Long Interval)
        """
        now = time.time()
        
        if aircraft_count > 0:
            interval = 10 # 10 seconds for active cells
        else:
            interval = 60 # 60 seconds for empty cells
            
        next_poll = now + interval
        
        # Update score in ZSET
        await self.redis.zadd(self.KEY_QUEUE, {cell: next_poll})
        
        # Update stats
        await self.redis.hset(self.KEY_COUNTS, cell, aircraft_count)

    def get_cell_center_radius(self, cell: str) -> tuple[float, float, int]:
        """Returns (lat, lon, radius_nm) for a cell."""
        lat, lon = h3.cell_to_latlng(cell)
        # Res 4 edge is ~22km. Center to vertex is ~25km. 
        # 25km = ~13.5nm. Let's use 15nm to be safe overlap.
        return lat, lon, 15
