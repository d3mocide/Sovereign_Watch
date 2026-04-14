import asyncio
import logging
import random
import socket
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
        attempts = 0
        while attempts <= max_retries:
            # We use attempts index to calculate delay, but log attempts+1
            delay = base_delay * (2 ** attempts)
            
            try:
                resp = await self.client.request(method, url, headers=headers, **kwargs)
                
                if resp.status_code == 429:
                    retry_after = resp.headers.get("Retry-After")
                    if retry_after and retry_after.isdigit():
                        delay = int(retry_after)
                    logger.warning("Rate limit (429) hit for %s. Backing off %.1fs", url, delay)
                elif 500 <= resp.status_code < 600:
                    logger.warning("Server error (%d) for %s. Attempt %d/%d", 
                                   resp.status_code, url, attempts + 1, max_retries + 1)
                else:
                    return resp
                
            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout) as exc:
                # DNS Diagnostic: Try to resolve the host manually to see if it's a resolution failure
                dns_status = "unknown"
                try:
                    from urllib.parse import urlparse
                    hostname = urlparse(url).hostname
                    if hostname:
                        ip = socket.gethostbyname(hostname)
                        dns_status = f"resolves to {ip}"
                except Exception as dns_exc:
                    dns_status = f"resolution failed: {repr(dns_exc)}"

                logger.warning("Network error (%s) for %s [DNS: %s]. Attempt %d/%d", 
                               repr(exc), url, dns_status, attempts + 1, max_retries + 1)
            
            except Exception as exc:
                logger.error("Unexpected error fetching %s: %s", url, repr(exc))
                return None

            if attempts >= max_retries:
                break

            jitter = random.uniform(0.8, 1.2)
            await asyncio.sleep(delay * jitter)
            attempts += 1
            
        logger.error("Max attempts (%d) reached for %s", max_retries + 1, url)
        return None
