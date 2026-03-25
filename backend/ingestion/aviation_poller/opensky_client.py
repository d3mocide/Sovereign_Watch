"""
OpenSky Network REST API client for sovereign-watch aviation ingestion.

Architectural differences from the ADSBx-compatible sources (adsb.fi, adsb.lol):

  - Query shape: bounding box (lamin/lomin/lamax/lomax) not center+radius
  - Response shape: state vectors as positional arrays, not named dicts
  - Units: velocity in m/s, altitude in meters, vertical_rate in m/s
    (translated to ADSBx-compatible knots / feet / ft·min⁻¹ before returning)
  - Rate limits: 400 credits/day anonymous, 8 000 credits/day authenticated
  - Auth: OAuth2 client-credentials flow (basic auth deprecated 2026-03-18)

The translate_state_vector() helper converts a raw 17-element state-vector
array into an ADSBx-compatible dict so the existing normalize_to_tak() and
classify_aircraft() pipeline in service.py needs zero changes.

State vector index mapping (OpenSky v1 REST API):
  [0]  icao24          → hex
  [1]  callsign        → flight
  [2]  origin_country  → ownOp  (crude proxy; no real operator DB on OpenSky)
  [3]  time_position   → derived seen_pos = now - time_position
  [4]  last_contact    → derived seen     = now - last_contact
  [5]  longitude       → lon   (degrees WGS-84)
  [6]  latitude        → lat   (degrees WGS-84)
  [7]  baro_altitude   → baro_alt (meters → feet)
  [8]  on_ground       → (not forwarded; OpenSky surface targets lack position)
  [9]  velocity        → gs   (m/s → knots)
  [10] true_track      → track (degrees, 0 = north)
  [11] vertical_rate   → baro_rate (m/s → ft/min)
  [12] sensors         → (omitted)
  [13] geo_altitude    → geom_alt (meters → feet)
  [14] squawk          → squawk
  [15] spi             → (omitted)
  [16] position_source → (omitted)
"""

import asyncio
import logging
import math
import time
from typing import Dict, List, Optional, Tuple

import aiohttp
from aiolimiter import AsyncLimiter

logger = logging.getLogger("opensky_client")

# ---------------------------------------------------------------------------
# OpenSky API endpoints
# ---------------------------------------------------------------------------
_STATES_URL = "https://opensky-network.org/api/states/all"
_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network"
    "/protocol/openid-connect/token"
)

# ---------------------------------------------------------------------------
# Unit-conversion helpers
# ---------------------------------------------------------------------------
_M_TO_FT = 3.28084  # metres → feet
_MS_TO_KT = 1.94384  # m/s   → knots
_MS_TO_FTMIN = 196.85  # m/s   → ft/min

# ---------------------------------------------------------------------------
# Bounding-box helper
# ---------------------------------------------------------------------------
_NM_TO_KM = 1.852


def nm_radius_to_bbox(
    center_lat: float, center_lon: float, radius_nm: float
) -> Tuple[float, float, float, float]:
    """
    Convert a center point + radius (nautical miles) to a WGS-84 bounding box.

    Returns (lamin, lomin, lamax, lomax).

    The latitude offset is exact; the longitude offset widens at high latitudes
    to keep the box circumscribed around the circle (never under-covering).
    """
    radius_km = radius_nm * _NM_TO_KM
    lat_delta = radius_km / 111.0  # 1° lat ≈ 111 km everywhere

    # lon degrees per km shrinks toward the poles
    cos_lat = math.cos(math.radians(center_lat))
    lon_delta = radius_km / (111.0 * cos_lat) if cos_lat > 1e-6 else 180.0

    lamin = max(-90.0, center_lat - lat_delta)
    lamax = min(90.0, center_lat + lat_delta)
    lomin = max(-180.0, center_lon - lon_delta)
    lomax = min(180.0, center_lon + lon_delta)

    return lamin, lomin, lamax, lomax


# ---------------------------------------------------------------------------
# State-vector translation
# ---------------------------------------------------------------------------
def translate_state_vector(sv: List, fetched_at: float) -> Optional[Dict]:
    """
    Convert a raw OpenSky state-vector array to an ADSBx-compatible dict.

    Returns None for on-ground targets (no reliable position) or targets
    missing lat/lon.
    """
    if len(sv) < 17:
        return None

    lat = sv[6]
    lon = sv[5]
    if lat is None or lon is None:
        return None

    # Skip surface position reports — they use a different message type and
    # often have stale/zero altitude, polluting the track.
    on_ground = bool(sv[8])
    if on_ground:
        return None

    # Derive ADSBx-style age fields from absolute timestamps
    time_position = sv[3]
    last_contact = sv[4]
    seen_pos = (fetched_at - time_position) if time_position else 0.0
    seen = (fetched_at - last_contact) if last_contact else 0.0

    # Unit conversions: OpenSky native → ADSBx expected units
    baro_alt_m = sv[7]
    geo_alt_m = sv[13]
    velocity_ms = sv[9]
    vrate_ms = sv[11]

    return {
        # Identification
        "hex": (sv[0] or "").lower(),
        "flight": (sv[1] or "").strip(),
        "squawk": sv[14] or "",
        # OpenSky has no per-aircraft operator DB; origin_country is a
        # rough proxy used only by government/military affiliation checks.
        "ownOp": sv[2] or "",
        # Position
        "lat": lat,
        "lon": lon,
        # Altitude: metres → feet (parse_altitude() multiplies by 0.3048)
        "baro_alt": (baro_alt_m * _M_TO_FT) if baro_alt_m is not None else None,
        "geom_alt": (geo_alt_m * _M_TO_FT) if geo_alt_m is not None else None,
        # Motion
        "gs": (velocity_ms * _MS_TO_KT) if velocity_ms is not None else None,
        "track": sv[10],
        # vertical_rate in m/s → ft/min (sign preserved; positive = climb)
        "baro_rate": (vrate_ms * _MS_TO_FTMIN) if vrate_ms is not None else None,
        # Age fields (seconds since last update)
        "seen_pos": max(0.0, seen_pos),
        "seen": max(0.0, seen),
        # Source tag consumed by process_aircraft_batch
        "_source": "opensky",
        "_fetched_at": fetched_at,
    }


# ---------------------------------------------------------------------------
# OpenSkyClient
# ---------------------------------------------------------------------------
class OpenSkyClient:
    """
    Async client for the OpenSky Network REST API.

    Usage
    -----
    Provide OPENSKY_CLIENT_ID + OPENSKY_CLIENT_SECRET for authenticated access
    (8 000 credits/day → ~1 request / 10 s).  Leave both empty for anonymous
    access (400 credits/day → ~1 request / 215 s).

    Separate rate limiters for bbox and watchlist modes allow testing with
    slower pacing for watchlist queries (e.g., OPENSKY_WATCHLIST_RATE_LIMIT_PERIOD=120s).
    """

    def __init__(
        self,
        client_id: str = "",
        client_secret: str = "",
        rate_limit_period: Optional[float] = None,
        watchlist_rate_limit_period: Optional[float] = None,
    ):
        self._client_id = client_id
        self._client_secret = client_secret
        self._authenticated = bool(client_id and client_secret)

        # Conservative defaults for bbox mode: burn ≤ 50 % of daily budget
        if rate_limit_period is None:
            # Authenticated: 4 000 req budget → 1 req / 21.6 s; use 22 s
            # Anonymous:       200 req budget → 1 req / 432 s; use 300 s (5 min)
            rate_limit_period = 22.0 if self._authenticated else 300.0

        # Watchlist mode default: same as bbox, but can be overridden for testing
        if watchlist_rate_limit_period is None:
            watchlist_rate_limit_period = rate_limit_period

        self.rate_limit_period = rate_limit_period
        self.watchlist_rate_limit_period = watchlist_rate_limit_period

        # Separate limiters for bbox and watchlist modes
        self._limiter_bbox = AsyncLimiter(1, rate_limit_period)
        self._limiter_watchlist = AsyncLimiter(1, watchlist_rate_limit_period)

        # Cooldown (same pattern as AviationSource)
        self.cooldown_until: float = 0.0
        self._cooldown_step: float = 30.0
        self._consecutive_penalties: int = 0

        # OAuth2 token cache
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0.0
        # Backoff token retries when credentials are invalid to avoid log spam.
        self._next_token_retry_at: float = 0.0

        self._session: Optional[aiohttp.ClientSession] = None

        # Track server-requested Retry-After for rate limit compliance
        self._retry_after_until: float = 0.0

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def start(self) -> None:
        self._session = aiohttp.ClientSession(
            headers={"User-Agent": "SovereignWatch/1.0"}
        )
        if self._authenticated:
            await self._refresh_token()

        auth_mode = "authenticated" if self._access_token else "anonymous"
        if self._authenticated and not self._access_token:
            logger.warning(
                "OpenSky credentials were provided but token retrieval failed; "
                "falling back to anonymous access until refresh succeeds"
            )
        logger.info(
            "OpenSkyClient ready — %s, bbox_rate_period=%.0fs, watchlist_rate_period=%.0fs",
            auth_mode,
            self.rate_limit_period,
            self.watchlist_rate_limit_period,
        )

    async def close(self) -> None:
        if self._session:
            await self._session.close()
            self._session = None

    # ------------------------------------------------------------------
    # Health / cooldown (mirrors AviationSource)
    # ------------------------------------------------------------------
    def is_healthy(self) -> bool:
        return time.time() >= self.cooldown_until

    def penalize(self) -> None:
        now = time.time()
        if self._consecutive_penalties == 0:
            self._cooldown_step = 30.0
        else:
            self._cooldown_step = min(self._cooldown_step * 2, 300.0)
        self._consecutive_penalties += 1
        self.cooldown_until = now + self._cooldown_step
        logger.warning(
            "opensky penalized — cooling down for %.0fs (until %s)",
            self._cooldown_step,
            time.strftime("%H:%M:%S", time.localtime(self.cooldown_until)),
        )

    def reset_cooldown(self) -> None:
        if self.cooldown_until > 0.0:
            logger.info("opensky recovered — cooldown cleared")
        self.cooldown_until = 0.0
        self._cooldown_step = 30.0
        self._consecutive_penalties = 0

    # ------------------------------------------------------------------
    # OAuth2 token management
    # ------------------------------------------------------------------
    async def _refresh_token(self) -> None:
        """Fetch a new OAuth2 access token via client-credentials flow."""
        if not self._session:
            raise RuntimeError("Client not started")

        data = {
            "grant_type": "client_credentials",
            "client_id": self._client_id,
            "client_secret": self._client_secret,
        }
        try:
            async with self._session.post(
                _TOKEN_URL,
                data=data,
                timeout=aiohttp.ClientTimeout(total=10.0),
            ) as resp:
                if resp.status >= 400:
                    body = (await resp.text()).strip().replace("\n", " ")
                    body_preview = body[:240] if body else "<empty body>"
                    logger.error(
                        "OpenSky token refresh failed: HTTP %d (%s)",
                        resp.status,
                        body_preview,
                    )
                    logger.error(
                        "Verify OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET are valid "
                        "OAuth2 client credentials for opensky-network"
                    )
                    self._access_token = None
                    self._token_expires_at = 0.0
                    self._next_token_retry_at = time.time() + 300.0
                    return

                payload = await resp.json()
                self._access_token = payload["access_token"]
                expires_in = int(payload.get("expires_in", 300))
                # Refresh 30 s before expiry
                self._token_expires_at = time.time() + expires_in - 30
                self._next_token_retry_at = 0.0
                logger.info("OpenSky token refreshed (expires in %ds)", expires_in)
        except Exception as exc:
            logger.error("OpenSky token refresh failed: %s", exc)
            self._access_token = None
            self._token_expires_at = 0.0
            self._next_token_retry_at = time.time() + 300.0

    async def _ensure_token(self) -> None:
        """Refresh the token if it has expired or is about to."""
        now = time.time()
        if not self._authenticated:
            return
        if now < self._next_token_retry_at:
            return
        if now >= self._token_expires_at:
            await self._refresh_token()

    def _auth_headers(self) -> Dict[str, str]:
        if self._authenticated and self._access_token:
            return {"Authorization": f"Bearer {self._access_token}"}
        return {}

    # ------------------------------------------------------------------
    # Fetch
    # ------------------------------------------------------------------
    # ------------------------------------------------------------------
    # Internal fetch helper
    # ------------------------------------------------------------------
    async def _fetch_states(
        self, params: Dict, limiter: AsyncLimiter
    ) -> Optional[Dict]:
        """
        Shared HTTP GET to /api/states/all with rate-limiting, auth, and
        error handling.  Returns the parsed JSON payload or None on failure.
        Callers are responsible for extracting 'states' from the result.

        The ``limiter`` parameter specifies which rate limiter to use
        (e.g., _limiter_bbox for bbox queries, _limiter_watchlist for watchlist).

        If OpenSky sends a Retry-After header (RFC 7231), this method respects it
        by updating _retry_after_until and logging the server's request.
        """
        if not self._session:
            raise RuntimeError("Client not started; call start() first")

        await self._ensure_token()

        # Check if server requested a retry delay
        now = time.time()
        if now < self._retry_after_until:
            wait_secs = self._retry_after_until - now
            logger.debug("opensky: honoring Retry-After — waiting %.0fs", wait_secs)
            await asyncio.sleep(wait_secs)

        async with limiter:
            fetched_at = time.time()
            try:
                async with self._session.get(
                    _STATES_URL,
                    params=params,
                    headers=self._auth_headers(),
                    timeout=aiohttp.ClientTimeout(total=15.0),
                ) as resp:
                    # Check for Retry-After header
                    if "Retry-After" in resp.headers:
                        retry_after_str = resp.headers.get("Retry-After", "60")
                        try:
                            retry_after_secs = int(retry_after_str)
                            self._retry_after_until = fetched_at + retry_after_secs
                            logger.warning(
                                "opensky: Retry-After header received — "
                                "server requests %.0fs delay (until %s)",
                                retry_after_secs,
                                time.strftime(
                                    "%H:%M:%S", time.localtime(self._retry_after_until)
                                ),
                            )
                        except ValueError:
                            logger.warning(
                                "opensky: Retry-After header present but unparseable: %s",
                                retry_after_str,
                            )

                    if resp.status == 429:
                        logger.warning("opensky: rate limited (429)")
                        self.penalize()
                        return None

                    if resp.status == 401:
                        logger.warning("opensky: auth error (401) — refreshing token")
                        await self._refresh_token()
                        return None

                    resp.raise_for_status()
                    payload = await resp.json()

            except (
                asyncio.TimeoutError,
                aiohttp.ServerConnectionError,
                aiohttp.ClientConnectorError,
                aiohttp.ServerDisconnectedError,
            ) as exc:
                logger.warning("opensky: transport error: %s", exc)
                self.penalize()
                return None
            except aiohttp.ClientResponseError as exc:
                logger.error("opensky: HTTP error %d: %s", exc.status, exc)
                self.penalize()
                return None

        self.reset_cooldown()
        # Attach fetch timestamp so translate_state_vector() can compute
        # seen_pos/seen correctly even when called after this method returns.
        if payload is not None:
            payload["_fetched_at"] = fetched_at
        return payload

    # ------------------------------------------------------------------
    # Bounding-box query (local/regional coverage)
    # ------------------------------------------------------------------
    async def fetch_bbox(
        self,
        lamin: float,
        lomin: float,
        lamax: float,
        lomax: float,
    ) -> List[Dict]:
        """
        Query OpenSky for all airborne state vectors within the given bounding
        box. Returns a list of ADSBx-compatible dicts ready for
        process_aircraft_batch().

        Returns an empty list on rate-limit or error.
        """
        params = {
            "lamin": lamin,
            "lomin": lomin,
            "lamax": lamax,
            "lomax": lomax,
        }
        payload = await self._fetch_states(params, self._limiter_bbox)
        if payload is None:
            return []

        fetched_at = payload["_fetched_at"]
        raw_states = payload.get("states") or []
        aircraft = []
        for sv in raw_states:
            translated = translate_state_vector(sv, fetched_at)
            if translated is not None:
                aircraft.append(translated)

        logger.debug(
            "opensky: bbox fetched %d airborne contacts (%.2f/%.2f → %.2f/%.2f)",
            len(aircraft),
            lamin,
            lomin,
            lamax,
            lomax,
        )
        return aircraft

    # ------------------------------------------------------------------
    # ICAO24 watchlist query (global coverage for specific aircraft)
    # ------------------------------------------------------------------
    async def fetch_icao_list(self, icao24s: List[str]) -> List[Dict]:
        """
        Query OpenSky for specific aircraft by ICAO24 hex address, globally.

        Unlike fetch_bbox() this is not restricted to any geographic area —
        it will find a watched aircraft wherever it is in the world.

        ``icao24s`` must be lowercase hex strings.  OpenSky accepts them as a
        comma-separated ``icao24`` query param.  Callers should chunk large
        watchlists into batches of ≤ 100 entries to stay within URL length
        limits.

        Returns an empty list on rate-limit, error, or empty watchlist.
        """
        if not icao24s:
            return []

        params = {"icao24": ",".join(icao24s)}
        payload = await self._fetch_states(params, self._limiter_watchlist)
        if payload is None:
            return []

        fetched_at = payload["_fetched_at"]
        raw_states = payload.get("states") or []
        aircraft = []
        for sv in raw_states:
            translated = translate_state_vector(sv, fetched_at)
            if translated is not None:
                translated["_source"] = "opensky_watchlist"
                aircraft.append(translated)

        logger.debug(
            "opensky: watchlist fetched %d/%d airborne contacts",
            len(aircraft),
            len(icao24s),
        )
        return aircraft
