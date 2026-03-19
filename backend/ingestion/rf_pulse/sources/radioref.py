"""
RadioReference source adapter.

Authenticates via the RadioReference SOAP API v2 using a developer app key
plus a licensed user account (username + password).  An auth token is
obtained from ``getAuthToken`` and reused until it expires, at which point a
single re-auth is attempted transparently.

Required environment variables
--------------------------------
RADIOREF_APP_KEY   - Developer app key from radioreference.com/apps/api/
RADIOREF_USERNAME  - RadioReference premium account username
RADIOREF_PASSWORD  - RadioReference premium account password

If any of the three are absent the source skips all fetches and logs a single
informational message at startup.
"""

import asyncio
import logging
import os

import httpx
import zeep
import zeep.exceptions
from zeep.transports import AsyncTransport

logger = logging.getLogger("rf_pulse.radioref")

WSDL_URL = "https://api.radioreference.com/soap2/?wsdl"


class RadioReferenceSource:
    def __init__(self, producer, redis_client, topic, fetch_interval_h):
        self.producer      = producer
        self.redis_client  = redis_client
        self.topic         = topic
        self.interval_sec  = fetch_interval_h * 3600

        self.app_key  = os.getenv("RADIOREF_APP_KEY", "")
        self.username = os.getenv("RADIOREF_USERNAME", "")
        self.password = os.getenv("RADIOREF_PASSWORD", "")

        # Cached session token; cleared on auth fault to force re-auth.
        self._auth_token: str | None = None

    # ------------------------------------------------------------------
    # Authentication helpers
    # ------------------------------------------------------------------

    async def _get_auth_token(self, client: zeep.AsyncClient) -> str:
        """Acquire a fresh auth token from the API and cache it.

        Credential values are intentionally never written to log output.
        """
        token = await client.service.getAuthToken(
            username=self.username,
            password=self.password,
            appKey=self.app_key,
        )
        self._auth_token = token
        logger.info("RadioReference: auth token acquired")
        return token

    def _auth_info(self) -> dict:
        """Build the authInfo dict required by most RR SOAP calls."""
        return {
            "appKey":    self.app_key,
            "username":  self.username,
            "authToken": self._auth_token,
        }

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def loop(self):
        if not (self.app_key and self.username and self.password):
            logger.info(
                "RadioReference: RADIOREF_APP_KEY/USERNAME/PASSWORD not fully set, "
                "skipping RadioReference ingestion."
            )
            return

        while True:
            try:
                await self._fetch_and_publish()
            except Exception:
                logger.exception("RadioReference: unhandled fetch error")
            await asyncio.sleep(self.interval_sec)

    # ------------------------------------------------------------------
    # Fetch + publish
    # ------------------------------------------------------------------

    async def _fetch_and_publish(self):
        transport = AsyncTransport(client=httpx.AsyncClient(timeout=30.0, follow_redirects=True))
        client = zeep.AsyncClient(WSDL_URL, transport=transport)

        # Ensure we have a valid auth token before making data calls.
        if not self._auth_token:
            await self._get_auth_token(client)

        try:
            systems = await self._fetch_systems(client)
        except zeep.exceptions.Fault as fault:
            # Auth token may have expired; clear it and retry once.
            logger.warning("RadioReference: SOAP fault (%s), attempting re-auth", fault.message)
            self._auth_token = None
            await self._get_auth_token(client)
            systems = await self._fetch_systems(client)

        published = 0
        for sys in systems:
            record = {
                "source":       "radioref",
                "site_id":      f"rr:sys:{sys.systemId}",
                "service":      "public_safety",
                "name":         sys.systemName,
                "lat":          float(sys.lat),
                "lon":          float(sys.lon),
                "modes":        [sys.systemType],   # e.g. "P25", "DMR"
                "status":       "Unknown",
                "country":      "US",
                "emcomm_flags": [],
                "meta":         {"type": "trunked_system"},
            }
            await self.producer.send(self.topic, value=record)
            published += 1

        logger.info("RadioReference: published %d systems to %s", published, self.topic)

    async def _fetch_systems(self, client: zeep.AsyncClient) -> list:
        """Fetch trunked systems for the United States (country ID 1)."""
        response = await client.service.getCountrySystemList(
            cid=1,
            authInfo=self._auth_info(),
        )
        return list(response or [])
