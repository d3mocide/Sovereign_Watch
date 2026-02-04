
import asyncio
import logging
import json
import time
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
import aiohttp
from aiolimiter import AsyncLimiter
from tenacity import retry, wait_exponential_jitter, stop_after_attempt, retry_if_exception_type

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("multi_source_poller")

@dataclass
class AviationSource:
    name: str
    base_url: str
    url_format: str  # URL format string with {lat}, {lon}, {radius} placeholders
    rate_limit_period: float  # seconds between requests (e.g., 2.0 = 1 req per 2 sec)
    priority: int      # Lower number = higher priority
    limiter: AsyncLimiter = field(init=False)
    consecutive_failures: int = 0
    
    def __post_init__(self):
        # AsyncLimiter(max_rate, time_period): allows max_rate tokens per time_period
        self.limiter = AsyncLimiter(1, self.rate_limit_period)

class MultiSourcePoller:
    """
    Implements a Round-Robin poller across multiple ADSBExchange-v2 compatible APIs.
    Features:
    - Independent Rate Limiting (aiolimiter)
    - Smart Retries with Jitter (tenacity)
    - Health Tracking & Failover
    """
    
    def __init__(self):
        # Define sources - ORDER MATTERS for round-robin priority
        # Put more permissive/reliable sources first, airplanes.live last (strictest)
        self.sources = [
            AviationSource(
                name="adsb_fi",
                base_url="https://opendata.adsb.fi/api/v3",
                url_format="/lat/{lat}/lon/{lon}/dist/{radius}",
                rate_limit_period=1.5,  # Can handle faster rates
                priority=1
            ),
            AviationSource(
                name="adsb_lol",
                base_url="https://api.adsb.lol/v2",
                url_format="/point/{lat}/{lon}/{radius}",
                rate_limit_period=1.5,
                priority=1
            ),
            AviationSource(
                name="airplanes_live",
                base_url="https://api.airplanes.live/v2",
                url_format="/point/{lat}/{lon}/{radius}",
                rate_limit_period=3.0,  # Conservative - they're strict
                priority=2  # Lower priority = use as backup
            ),
        ]
        self.current_idx = 0
        self.request_count = 0  # Track for weighted rotation
        self.session: Optional[aiohttp.ClientSession] = None

    async def start(self):
        self.session = aiohttp.ClientSession(headers={"User-Agent": "SovereignWatch/1.0"})
        logger.info(f"Initialized MultiSourcePoller with {len(self.sources)} sources")

    async def close(self):
        if self.session:
            await self.session.close()

    def _get_next_source(self) -> AviationSource:
        """Weighted source selection - favor adsb.fi and adsb.lol, use airplanes.live sparingly."""
        self.request_count += 1
        
        # Weighted pattern: use airplanes.live only every 5th request
        # Pattern: fi, lol, fi, lol, airplanes (repeat)
        if self.request_count % 5 == 0:
            # Use airplanes.live (index 2) every 5th request
            source = self.sources[2]
        else:
            # Alternate between adsb_fi (0) and adsb_lol (1)
            source = self.sources[self.request_count % 2]
        
        # Health check - skip if too many failures
        if source.consecutive_failures >= 5:
            # Fallback to any healthy source
            for s in self.sources:
                if s.consecutive_failures < 5:
                    return s
            # All failing? Reset and try anyway
            logger.warning("All sources experiencing failures. Resetting counters.")
            for s in self.sources:
                s.consecutive_failures = 0
        
        return source

    @retry(
        wait=wait_exponential_jitter(initial=0.5, max=5.0, jitter=1.0),
        stop=stop_after_attempt(2),
        retry=retry_if_exception_type((aiohttp.ClientError, asyncio.TimeoutError))
    )
    async def _fetch(self, source: AviationSource, url: str) -> Dict:
        async with source.limiter:
            async with self.session.get(url, timeout=5.0) as resp:
                if resp.status == 429:
                    # Rate limited
                    logger.warning(f"Rate limited by {source.name}")
                    source.consecutive_failures += 1
                    raise aiohttp.ClientResponseError(resp.request_info, resp.history, status=429, message="Rate limit")
                
                resp.raise_for_status()
                source.consecutive_failures = 0
                return await resp.json()

    async def poll_point(self, lat: float, lon: float, radius_nm: int) -> List[Dict]:
        """
        Polls a single point using the next available source.
        Returns a list of raw aircraft objects (ADSBx v2 format).
        """
        source = self._get_next_source()
        path = source.url_format.format(lat=lat, lon=lon, radius=radius_nm)
        url = f"{source.base_url}{path}"
        
        try:
            data = await self._fetch(source, url)
            
            # Normalize response (some return {ac: []}, some {aircraft: []})
            aircraft = data.get("ac") or data.get("aircraft") or []
            
            # Inject source metadata
            for ac in aircraft:
                ac["_source"] = source.name
                ac["_fetched_at"] = time.time()
                
            return aircraft

        except Exception as e:
            logger.error(f"Failed to poll {source.name}: {e}")
            source.consecutive_failures += 1
            return []
