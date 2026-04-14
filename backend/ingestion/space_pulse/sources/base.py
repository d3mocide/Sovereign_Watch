import asyncio
import logging
import random
from typing import Dict, Optional

import httpx

logger = logging.getLogger("space_pulse.base")

class BaseSource:
    """Base class for ingestion sources with shared resilience logic."""
    
    def __init__(self, client: httpx.AsyncClient):
        self.client = client
        self.running = True

    async def fetch_with_retry(
        self,
        url: str,
        method: str = "GET",
        max_retries: int = 3,
        base_delay: float = 1.0,
        headers: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> Optional[httpx.Response]:
        """
        Perform an HTTP request with jittered exponential backoff for common transient errors.
        
        Transient errors handled:
        - Connection errors (ConnectError)
        - Timeouts (TimeoutException)
        - Rate limits (429)
        - Server errors (5xx)
        """
        retries = 0
        while retries <= max_retries:
            try:
                resp = await self.client.request(method, url, headers=headers, **kwargs)
                
                if resp.status_code == 429:
                    # Specific handling for Rate Limit
                    retry_after = resp.headers.get("Retry-After")
                    delay = int(retry_after) if retry_after and retry_after.isdigit() else (base_delay * (2 ** retries))
                    logger.warning("Rate limit (429) hit for %s. Backing off %.1fs", url, delay)
                elif 500 <= resp.status_code < 600:
                    delay = base_delay * (2 ** retries)
                    logger.warning("Server error (%d) for %s. Retry %d/%d in %.1fs", 
                                   resp.status_code, url, retries + 1, max_retries, delay)
                else:
                    # 2xx or other (e.g. 404) that we don't naturally retry
                    return resp
                
            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout) as exc:
                delay = base_delay * (2 ** retries)
                logger.warning("Network error (%s) for %s. Retry %d/%d in %.1fs", 
                               repr(exc), url, retries + 1, max_retries, delay)
            
            except Exception as exc:
                # Unexpected exception, log and stop retrying for this cycle
                logger.error("Unexpected error fetching %s: %s", url, repr(exc))
                return None

            # Exponential backoff with jitter
            jitter = random.uniform(0.8, 1.2)
            await asyncio.sleep(delay * jitter)
            retries += 1
            
        logger.error("Max retries exceeded for %s", url)
        return None
