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

Optional environment variables
--------------------------------
RADIOREF_STATE_IDS - Comma-separated list of RR state IDs to scan (default: "43,56" = OR, WA)
RF_RR_RADIUS_MI    - Radius in miles from CENTER_LAT/CENTER_LON to filter systems (default: 200)
CENTER_LAT         - Center latitude for radius filtering (default: 45.5152)
CENTER_LON         - Center longitude for radius filtering (default: -122.6784)

If any of the three required vars are absent the source skips all fetches and logs a single
informational message at startup.

Fetch strategy
--------------
getCountyListByState(stid) → county list
  getTrsList(cid)           → system stubs (sid, sName, sType) per county
    getTrsDetails(sid)      → full system record including lat/lon for radius filtering
"""

import asyncio
import logging
import math
import os
import time
from datetime import datetime, UTC

import httpx
import zeep
import zeep.exceptions
from zeep.transports import AsyncTransport

from sources.fips_states import STATE_FIPS

logger = logging.getLogger("rf_pulse.radioref")

WSDL_URL = "https://api.radioreference.com/soap2/?wsdl&v=9"

CENTER_LAT   = float(os.getenv("CENTER_LAT", "45.5152"))
CENTER_LON   = float(os.getenv("CENTER_LON", "-122.6784"))
RR_RADIUS_MI = int(os.getenv("RF_RR_RADIUS_MI", "200"))

# Comma-separated RR state IDs to scan. If "AUTO" or empty, this will dynamically select states
# whose centers fall within RR_RADIUS_MI + buffer of CENTER_LAT / CENTER_LON.
_ENV_STATES = os.getenv("RADIOREF_STATE_IDS", "AUTO").strip().upper()


def _haversine_mi(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.8
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


class RadioReferenceSource:
    def __init__(self, producer, redis_client, topic, fetch_interval_h):
        self.producer      = producer
        self.redis_client  = redis_client
        self.topic         = topic
        self.interval_sec  = fetch_interval_h * 3600
        # UTC hour (0-23) at which the weekly RadioReference sync is allowed to run.
        # Defaults to 4 AM UTC — offset from FCC (3 AM) to spread heavy fetches.
        self.fetch_hour    = int(os.getenv("RF_RR_FETCH_HOUR", "4"))

        self.app_key  = os.getenv("RADIOREF_APP_KEY", "")
        self.username = os.getenv("RADIOREF_USERNAME", "")
        self.password = os.getenv("RADIOREF_PASSWORD", "")

    # ------------------------------------------------------------------
    # Authentication helpers
    # ------------------------------------------------------------------

    def _auth_info(self) -> dict:
        """Build the authInfo dict required by most RR SOAP calls."""
        return {
            "appKey":   self.app_key,
            "username": self.username,
            "password": self.password,
            "version":  "latest",
            "style":    "rpc",
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
                # Check for last-fetch timestamp in Redis to avoid over-fetching on restarts
                last_fetch = await self.redis_client.get("rf_pulse:radioref:last_fetch")
                now = time.time()

                if last_fetch:
                    elapsed = now - float(last_fetch)
                    if elapsed < self.interval_sec:
                        wait_sec = self.interval_sec - elapsed
                        logger.info(
                            "RadioReference: last fetch was %.1f hours ago. "
                            "Cooldown active (interval: %.1f hours). Skipping for %.1f hours.",
                            elapsed / 3600, self.interval_sec / 3600, wait_sec / 3600
                        )
                        await asyncio.sleep(wait_sec)
                        continue

                current_hour = datetime.now(UTC).hour
                if self.fetch_hour >= 0 and current_hour != self.fetch_hour:
                    logger.info(
                        "RadioReference: sync due but deferring to %02d:00 UTC "
                        "(currently %02d:00 UTC) to avoid peak-hour contention.",
                        self.fetch_hour, current_hour,
                    )
                    await asyncio.sleep(3600)  # re-check in 1 hour
                    continue

                await self._fetch_and_publish()
                await self.redis_client.set(
                    "rf_pulse:radioref:last_fetch", str(time.time()),
                    ex=int(self.interval_sec * 2),
                )
                
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
        settings = zeep.Settings(strict=False, xml_huge_tree=True)
        client = zeep.AsyncClient(WSDL_URL, transport=transport, settings=settings)

        auth = self._auth_info()
        published = 0
        
        # Mapping helpers
        stype_mapping = {
            1: "Motorola Type II", 2: "Motorola Type II", 3: "Motorola Type II",
            5: "P25", 6: "P25", 8: "P25", 11: "EDACS", 12: "LTR", 13: "DMR", 14: "NXDN",
        }
        mode_mapping = {
            "1": "FM", "2": "NFM", "3": "DMR", "4": "P25", "10": "P25 Phase 2", "11": "D-Star", "14": "YSF Fusion", "15": "NXDN",
        }

        state_ids_to_scan = []
        if _ENV_STATES == "AUTO" or not _ENV_STATES:
            # Dynamically calc which states are geographically relevant
            # We add a 300 mile buffer to state centers so boundary counties aren't missed
            for s_info in STATE_FIPS.values():
                dist = _haversine_mi(CENTER_LAT, CENTER_LON, s_info["lat"], s_info["lon"])
                if dist <= (RR_RADIUS_MI + 300):
                    state_ids_to_scan.append(s_info["fips"])
        else:
            state_ids_to_scan = [int(s.strip()) for s in _ENV_STATES.split(",") if s.strip().isdigit()]

        logger.info(
            "RadioReference: scanning %d state(s) (IDs: %s) for sites within %d mi of %.4f,%.4f",
            len(state_ids_to_scan), state_ids_to_scan, RR_RADIUS_MI, CENTER_LAT, CENTER_LON,
        )

        for stid in state_ids_to_scan:
            try:
                state_info = await client.service.getStateInfo(stid=stid, authInfo=auth)
            except zeep.exceptions.Fault:
                continue

            # 1. Fetch Trunked Sites
            seen_sys_ids = set()
            stubs = []
            if hasattr(state_info, "trsList") and state_info.trsList:
                stubs.extend(state_info.trsList)

            counties = state_info.countyList if hasattr(state_info, "countyList") else []
            for county in counties:
                try:
                    county_info = await client.service.getCountyInfo(ctid=county.ctid, authInfo=auth)
                    if hasattr(county_info, "trsList") and county_info.trsList:
                        stubs.extend(county_info.trsList)
                    
                    # 2. Fetch Conventional Frequencies from Categories
                    if hasattr(county_info, "cats") and county_info.cats:
                        for cat in county_info.cats:
                            if not hasattr(cat, "subcats") or not cat.subcats:
                                continue
                            for sc in cat.subcats:
                                # Skip if no location or too far
                                try:
                                    sc_lat = float(sc.lat or 0)
                                    sc_lon = float(sc.lon or 0)
                                except (TypeError, ValueError):
                                    sc_lat, sc_lon = 0.0, 0.0
                                
                                if sc_lat != 0.0 or sc_lon != 0.0:
                                    if _haversine_mi(CENTER_LAT, CENTER_LON, sc_lat, sc_lon) > RR_RADIUS_MI:
                                        continue
                                
                                # Pull freqs in subcategory
                                try:
                                    freqs = await client.service.getSubcatFreqs(scid=sc.scid, authInfo=auth)
                                    if not freqs:
                                        continue
                                    for f in freqs:
                                        f_mode = mode_mapping.get(str(f.mode), "FM")
                                        record = {
                                            "source": "radioref",
                                            "site_id": f"rr:conv:{f.fid}",
                                            "service": "public_safety",
                                            "name": f.descr or f.alpha,
                                            "lat": sc_lat,
                                            "lon": sc_lon,
                                            "modes": [f_mode],
                                            "output_freq": float(f.out) if f.out else None,
                                            "input_freq": float(f.in_prop) if hasattr(f, "in_prop") and f.in_prop else None, # Zeep maps "in" to "in_prop"
                                            "tone_ctcss": f.tone if f.tone and f.tone.replace(".", "").isdigit() else None,
                                            "status": "Active",
                                            "city": getattr(county_info, "ctName", None),
                                            "state": state_info.stateName,
                                            "country": "US",
                                            "meta": {"type": "conventional", "cat": cat.cName, "subcat": sc.scName, "alpha": f.alpha},
                                        }
                                        await self.producer.send(self.topic, value=record)
                                        published += 1
                                except zeep.exceptions.Fault:
                                    continue
                except zeep.exceptions.Fault:
                    continue

                # Fetch and publish Sites for each unique system stub
                for stub in stubs:
                    if stub.sid in seen_sys_ids:
                        continue
                    seen_sys_ids.add(stub.sid)
                    
                    try:
                        # Fetch sites for the system to get precise locations and freqs
                        sites = await client.service.getTrsSites(sid=stub.sid, authInfo=auth)
                        if not sites:
                            continue
                            
                        sys_mode = stype_mapping.get(stub.sType, "P25")
                        
                        for site in sites:
                            try:
                                s_lat = float(site.lat or 0)
                                s_lon = float(site.lon or 0)
                            except (TypeError, ValueError):
                                s_lat, s_lon = 0.0, 0.0
                                
                            if s_lat != 0.0 or s_lon != 0.0:
                                if _haversine_mi(CENTER_LAT, CENTER_LON, s_lat, s_lon) > RR_RADIUS_MI:
                                    continue
                            
                            # Use first frequency if available
                            primary_freq = None
                            if hasattr(site, "siteFreqs") and site.siteFreqs:
                                for f in site.siteFreqs:
                                    if f.freq:
                                        primary_freq = float(f.freq)
                                        break
                                        
                            record = {
                                "source": "radioref",
                                "site_id": f"rr:site:{site.siteId}",
                                "service": "public_safety",
                                "name": f"{stub.sName}: {site.siteDescr}",
                                "lat": s_lat,
                                "lon": s_lon,
                                "modes": [sys_mode],
                                "output_freq": primary_freq,
                                "status": "Active",
                                "city": site.siteLocation or stub.sCity,
                                "state": state_info.stateName,
                                "country": "US",
                                "meta": {
                                    "type": "trunked_site", 
                                    "system_name": stub.sName, 
                                    "system_id": stub.sid,
                                    "site_id": site.siteId
                                },
                            }
                            await self.producer.send(self.topic, value=record)
                            published += 1
                    except zeep.exceptions.Fault:
                        continue

        logger.info("RadioReference: published %d sites/frequencies to %s", published, self.topic)
