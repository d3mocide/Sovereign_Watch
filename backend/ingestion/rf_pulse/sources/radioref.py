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
import json
import logging
import math
import os
import time
from datetime import datetime, UTC
from xml.sax.saxutils import escape as _xml_escape

import aiohttp
from lxml import etree

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

    async def _post_soap(self, method: str, params: dict, client: aiohttp.ClientSession) -> etree._Element:
        auth = self._auth_info()
        auth_xml = "".join(f"<{k}>{_xml_escape(str(v))}</{k}>" for k, v in auth.items())
        params_xml = "".join(f"<{k}>{_xml_escape(str(v))}</{k}>" for k, v in params.items())
        
        body = f"""<?xml version="1.0" encoding="utf-8"?>
<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/">
    <soap-env:Body>
        <ns0:{method} xmlns:ns0="http://api.radioreference.com/soap2">
            {params_xml}
            <authInfo>{auth_xml}</authInfo>
        </ns0:{method}>
    </soap-env:Body>
</soap-env:Envelope>"""

        headers = {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": f"http://api.radioreference.com/soap2#{method}"
        }

        async with client.post("https://api.radioreference.com/soap2/index.php", data=body, headers=headers) as resp:
            resp.raise_for_status()
            content = await resp.read()
            # Parse XML and strip namespaces for easier searching
            parser = etree.XMLParser(recover=True, remove_blank_text=True, load_dtd=False, no_network=True)
            root = etree.fromstring(content, parser)
            
            # Find the Body element
            for child in root:
                if "Body" in child.tag:
                    fault = child.find(".//{http://schemas.xmlsoap.org/soap/envelope/}Fault")
                    if fault is not None:
                        fault_str = fault.findtext("faultstring", default="Unknown SOAP Fault")
                        raise Exception(f"SOAP Fault in {method}: {fault_str}")
                    return child

            return root

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
                
            except Exception as e:
                logger.exception("RadioReference: unhandled fetch error")
                try:
                    await self.redis_client.set(
                        "poller:radioref:last_error",
                        json.dumps({"ts": time.time(), "msg": str(e)}),
                        ex=86400,
                    )
                except Exception:
                    pass

            await asyncio.sleep(self.interval_sec)

    # ------------------------------------------------------------------
    # Fetch + publish
    # ------------------------------------------------------------------

    async def _fetch_and_publish(self):
        headers = {"User-Agent": "SovereignWatch/1.0"}
        timeout = aiohttp.ClientTimeout(total=60.0)
        
        async with aiohttp.ClientSession(timeout=timeout, headers=headers) as client:
            published = 0
            
            stype_mapping = {
                "1": "Motorola Type II", "2": "Motorola Type II", "3": "Motorola Type II",
                "5": "P25", "6": "P25", "8": "P25", "11": "EDACS", "12": "LTR", "13": "DMR", "14": "NXDN",
            }
            mode_mapping = {
                "1": "FM", "2": "NFM", "3": "DMR", "4": "P25", "10": "P25 Phase 2", "11": "D-Star", "14": "YSF Fusion", "15": "NXDN",
            }

            state_ids_to_scan = []
            if _ENV_STATES == "AUTO" or not _ENV_STATES:
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
                    state_info_resp = await self._post_soap("getStateInfo", {"stid": stid}, client)
                    state_name = state_info_resp.findtext(".//stateName", default="")
                except Exception as e:
                    logger.warning(f"Error fetching state {stid}: {e}")
                    continue

                seen_sys_ids = set()
                stubs = []
                
                # Extract TRS list from State
                for trs in state_info_resp.findall(".//trsList/item"):
                    sid = trs.findtext("sid")
                    if sid:
                        stubs.append({
                            "sid": sid,
                            "sName": trs.findtext("sName", ""),
                            "sType": trs.findtext("sType", ""),
                            "sCity": trs.findtext("sCity", ""),
                        })

                # Extract counties
                counties = [c.findtext("ctid") for c in state_info_resp.findall(".//countyList/item") if c.findtext("ctid")]
                logger.info("RadioReference: %s has %d counties to process.", state_name, len(counties))
                
                for cidx, ctid in enumerate(counties, start=1):
                    if cidx % 10 == 0:
                        logger.info("RadioReference: [%s] processing county %d/%d", state_name, cidx, len(counties))
                    try:
                        county_info = await self._post_soap("getCountyInfo", {"ctid": ctid}, client)
                        ct_name = county_info.findtext(".//ctName", default="")
                        
                        for trs in county_info.findall(".//trsList/item"):
                            sid = trs.findtext("sid")
                            if sid:
                                stubs.append({
                                    "sid": sid,
                                    "sName": trs.findtext("sName", ""),
                                    "sType": trs.findtext("sType", ""),
                                    "sCity": trs.findtext("sCity", ""),
                                })
                        
                        # Conventional Frequencies
                        for cat in county_info.findall(".//cats/item"):
                            cat_name = cat.findtext("cName", "")
                            for sc in cat.findall(".//subcats/item"):
                                scid = sc.findtext("scid")
                                if not scid:
                                    continue
                                
                                try:
                                    sc_lat = float(sc.findtext("lat") or 0)
                                    sc_lon = float(sc.findtext("lon") or 0)
                                except (TypeError, ValueError):
                                    sc_lat, sc_lon = 0.0, 0.0
                                
                                if sc_lat != 0.0 or sc_lon != 0.0:
                                    if _haversine_mi(CENTER_LAT, CENTER_LON, sc_lat, sc_lon) > RR_RADIUS_MI:
                                        continue
                                
                                try:
                                    freqs_resp = await self._post_soap("getSubcatFreqs", {"scid": scid}, client)
                                    for f in freqs_resp.findall(".//item"): # assuming it returns array of freqs
                                        # sometimes it's wrapped in a return element
                                        fid = f.findtext("fid")
                                        if not fid:
                                            continue
                                            
                                        f_mode = mode_mapping.get(f.findtext("mode", ""), "FM")
                                        desc = f.findtext("descr") or f.findtext("alpha", "")
                                        out_f = f.findtext("out")
                                        in_f = f.findtext("in")
                                        tone = f.findtext("tone")
                                        
                                        record = {
                                            "source": "radioref",
                                            "site_id": f"rr:conv:{fid}",
                                            "service": "public_safety",
                                            "name": desc,
                                            "lat": sc_lat,
                                            "lon": sc_lon,
                                            "modes": [f_mode],
                                            "output_freq": float(out_f) if out_f else None,
                                            "input_freq": float(in_f) if in_f else None,
                                            "tone_ctcss": tone if tone and tone.replace(".", "").isdigit() else None,
                                            "status": "Active",
                                            "city": ct_name,
                                            "state": state_name,
                                            "country": "US",
                                            "meta": {"type": "conventional", "cat": cat_name, "subcat": sc.findtext("scName", ""), "alpha": f.findtext("alpha", "")},
                                        }
                                        await self.producer.send(self.topic, value=record)
                                        published += 1
                                except Exception:
                                    continue
                    except Exception:
                        continue

                # Fetch and publish Sites for each unique system stub
                for stub in stubs:
                    sid = stub["sid"]
                    if sid in seen_sys_ids:
                        continue
                    seen_sys_ids.add(sid)
                    
                    try:
                        sites_resp = await self._post_soap("getTrsSites", {"sid": sid}, client)
                        sys_mode = stype_mapping.get(stub["sType"], "P25")
                        
                        for site in sites_resp.findall(".//item"):
                            site_id = site.findtext("siteId")
                            if not site_id:
                                continue
                                
                            try:
                                s_lat = float(site.findtext("lat") or 0)
                                s_lon = float(site.findtext("lon") or 0)
                            except (TypeError, ValueError):
                                s_lat, s_lon = 0.0, 0.0
                                
                            if s_lat != 0.0 or s_lon != 0.0:
                                if _haversine_mi(CENTER_LAT, CENTER_LON, s_lat, s_lon) > RR_RADIUS_MI:
                                    continue
                            
                            primary_freq = None
                            for f in site.findall(".//siteFreqs/item"):
                                freq_val = f.findtext("freq")
                                if freq_val:
                                    primary_freq = float(freq_val)
                                    break
                                    
                            record = {
                                "source": "radioref",
                                "site_id": f"rr:site:{site_id}",
                                "service": "public_safety",
                                "name": f"{stub['sName']}: {site.findtext('siteDescr', '')}",
                                "lat": s_lat,
                                "lon": s_lon,
                                "modes": [sys_mode],
                                "output_freq": primary_freq,
                                "status": "Active",
                                "city": site.findtext("siteLocation") or stub["sCity"],
                                "state": state_name,
                                "country": "US",
                                "meta": {
                                    "type": "trunked_site", 
                                    "system_name": stub["sName"], 
                                    "system_id": sid,
                                    "site_id": site_id
                                },
                            }
                            await self.producer.send(self.topic, value=record)
                            published += 1
                    except Exception:
                        continue

            logger.info("RadioReference: published %d sites/frequencies to %s", published, self.topic)
