
import asyncio
import logging
import json
import time
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
import aiohttp
from aiolimiter import AsyncLimiter
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("multi_source_poller")

# Only retry genuine transport-level failures, never HTTP-level errors like 429.
# aiohttp.ClientResponseError (which covers 429) is a subclass of aiohttp.ClientError,
# so the original retry_if_exception_type(aiohttp.ClientError) was accidentally retrying
# 429s — consuming two limiter tokens per failed request and producing the error cascade.
_RETRYABLE_ERRORS = (
    asyncio.TimeoutError,
    aiohttp.ServerConnectionError,
    aiohttp.ClientConnectorError,
    aiohttp.ServerDisconnectedError,
)

@dataclass
class AviationSource:
    name: str
    base_url: str
    url_format: str  # URL format string with {lat}, {lon}, {radius} placeholders
    rate_limit_period: float  # seconds between requests (e.g., 2.0 = 1 req per 2 sec)
    priority: int      # Lower number = higher priority
    limiter: AsyncLimiter = field(init=False)
    # Cooldown replaces the old consecutive_failures counter.
    # A source is skipped until wall-clock time exceeds cooldown_until.
    # Each 429 or network failure doubles the cooldown period (exponential backoff).
    cooldown_until: float = field(init=False, default=0.0)
    _cooldown_step: float = field(init=False, default=30.0)

    def __post_init__(self):
        # AsyncLimiter(max_rate, time_period): allows max_rate tokens per time_period
        self.limiter = AsyncLimiter(1, self.rate_limit_period)

    def is_healthy(self) -> bool:
        """True if this source is not currently in a cooldown window."""
        return time.time() >= self.cooldown_until

    def penalize(self) -> None:
        """
        Apply exponential backoff after a 429 or transport failure.
        Starts at 30s, doubles on each successive failure, caps at 5 minutes.
        Once the cooldown expires naturally, the step resets on first success.
        """
        now = time.time()
        # If we're already in a cooldown window, escalate; otherwise start fresh.
        if now < self.cooldown_until:
            self._cooldown_step = min(self._cooldown_step * 2, 300.0)
        else:
            self._cooldown_step = 30.0
        self.cooldown_until = now + self._cooldown_step
        logger.warning(f"{self.name} penalized — cooling down for {self._cooldown_step:.0f}s "
                       f"(until {time.strftime('%H:%M:%S', time.localtime(self.cooldown_until))})")

    def reset_cooldown(self) -> None:
        """Clear cooldown after a successful response."""
        if self.cooldown_until > 0.0:
            logger.info(f"{self.name} recovered — cooldown cleared")
        self.cooldown_until = 0.0
        self._cooldown_step = 30.0


class MultiSourcePoller:
    """
    Implements a Round-Robin poller across multiple ADSBExchange-v2 compatible APIs.
    Features:
    - Independent Rate Limiting (aiolimiter) — one token consumed per logical request
    - Retry on transport errors only (timeouts, connection resets)
    - Exponential cooldown on 429 / persistent failures (not retried)
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
                rate_limit_period=2.0,  # Sustainable polling (was 1.0)
                priority=1
            ),
            AviationSource(
                name="adsb_lol",
                base_url="https://api.adsb.lol/v2",
                url_format="/point/{lat}/{lon}/{radius}",
                rate_limit_period=2.0,  # Sustainable polling (was 1.0)
                priority=1
            ),
            AviationSource(
                name="airplanes_live",
                base_url="https://api.airplanes.live/v2",
                url_format="/point/{lat}/{lon}/{radius}",
                rate_limit_period=30.0,  # Strict limit for backup source
                priority=2  # Lower priority = use as backup
            ),
        ]
        self.request_count = 0  # Track for weighted rotation
        self.session: Optional[aiohttp.ClientSession] = None

    async def start(self):
        self.session = aiohttp.ClientSession(headers={"User-Agent": "SovereignWatch/1.0"})
        logger.info(f"Initialized MultiSourcePoller with {len(self.sources)} sources")

    async def close(self):
        if self.session:
            await self.session.close()

    def _get_next_source(self) -> AviationSource:
        """
        Weighted source selection — favor adsb.fi and adsb.lol, use airplanes.live
        sparingly. Falls back to any healthy source if the preferred one is in cooldown.
        If all sources are in cooldown, uses the one with the nearest recovery time
        rather than blocking.
        """
        self.request_count += 1

        # Weighted pattern: use airplanes.live only every 10th request
        # Pattern: fi/lol alternates, airplanes (every 10th)
        if self.request_count % 10 == 0:
            preferred = self.sources[2]  # airplanes_live
        else:
            preferred = self.sources[self.request_count % 2]  # alternate fi/lol

        if preferred.is_healthy():
            return preferred

        # Preferred source is in cooldown — fall back to any healthy source
        for source in sorted(self.sources, key=lambda s: s.priority):
            if source.is_healthy():
                return source

        # All sources in cooldown — use the one that recovers soonest
        earliest = min(self.sources, key=lambda s: s.cooldown_until)
        logger.warning(f"All sources in cooldown. Falling through to {earliest.name}.")
        return earliest

    @retry(
        wait=wait_exponential(multiplier=0.5, min=0.5, max=5.0),
        stop=stop_after_attempt(2),
        retry=retry_if_exception_type(_RETRYABLE_ERRORS)
    )
    async def _fetch(self, source: AviationSource, url: str) -> Dict:
        """
        Fetch from a single source. The rate limiter is acquired once per logical
        request — the retry decorator only fires on transport-level exceptions
        (_RETRYABLE_ERRORS), so it never re-enters the limiter for 429s.
        """
        async with source.limiter:
            async with self.session.get(
                url, timeout=aiohttp.ClientTimeout(total=5.0)
            ) as resp:
                if resp.status == 429:
                    # Rate limited by source — penalize with exponential cooldown.
                    # Return empty dict rather than raising so the retry decorator
                    # does NOT fire (429 is not in _RETRYABLE_ERRORS).
                    logger.warning(f"Rate limited by {source.name}")
                    source.penalize()
                    return {}

                resp.raise_for_status()
                source.reset_cooldown()
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

            # Capture fetch time once for all aircraft in this response so they
            # all share the same temporal anchor (used by normalize_to_tak for
            # source_ts calculation — see Fix A in the jitter analysis).
            fetched_at = time.time()
            for ac in aircraft:
                ac["_source"] = source.name
                ac["_fetched_at"] = fetched_at

            return aircraft

        except Exception as e:
            logger.error(f"Failed to poll {source.name}: {e}")
            source.penalize()
            return []
