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

WSDL_URL = "https://api.radioreference.com/soap2/?wsdl&v=9"


class RadioReferenceSource:
    def __init__(self, producer, redis_client, topic, fetch_interval_h):
        self.producer      = producer
        self.redis_client  = redis_client
        self.topic         = topic
        self.interval_sec  = fetch_interval_h * 3600

        self.app_key  = os.getenv("RADIOREF_APP_KEY", "")
        self.username = os.getenv("RADIOREF_USERNAME", "")
        self.password = os.getenv("RADIOREF_PASSWORD", "")
        # No authToken needed as we pass password and version directly.

    # ------------------------------------------------------------------
    # Authentication helpers
    # ------------------------------------------------------------------

    def _auth_info(self) -> dict:
        """Build the authInfo dict required by most RR SOAP calls."""
        return {
            "appKey":    self.app_key,
            "username":  self.username,
            "password":  self.password,
            "version":   "latest",
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
        headers = {"User-Agent": "SovereignWatch/1.0"}
        transport = AsyncTransport(
            client=httpx.AsyncClient(timeout=30.0, follow_redirects=True, headers=headers),
            wsdl_client=httpx.Client(timeout=30.0, follow_redirects=True, headers=headers)
        )
        client = zeep.AsyncClient(WSDL_URL, transport=transport)

        try:
            systems = await self._fetch_systems(client)
        except zeep.exceptions.Fault as fault:
            logger.warning("RadioReference: SOAP fault (%s)", fault.message)
            return

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
        """Fetch trunked systems.
        Note: The original getCountrySystemList method does not exist in the v9 Radio Reference SOAP API.
        Trunked system ingestion needs to be reimplemented using valid methods (e.g. getTrsDetails).
        """
        logger.warning("RadioReference trunked system ingestion is currently disabled (API method unsupported).")
        return []
