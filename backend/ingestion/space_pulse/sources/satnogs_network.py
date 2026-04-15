"""
SatNOGS Network source adapter.

Fetches recent "good" observations from the SatNOGS ground-station network
(network.satnogs.org). An observation records a satellite pass as actually
received by a volunteer ground station — including the frequency observed,
demodulation mode, and signal quality verdict.

Cross-referencing these observations against the transmitter catalog (from
SatNOGSDBSource) enables spectrum verification: confirming that satellites
are transmitting on their registered frequencies, and flagging anomalies where
observed frequencies deviate from catalogue values.

API: https://network.satnogs.org/api/observations/?format=json&status=good
     Observations newer than `observation_age` days are returned, paginated.
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta, UTC

from sources.base import BaseSource

logger = logging.getLogger("space_pulse.network")

SATNOGS_NETWORK_BASE = "https://network.satnogs.org/api"
OBSERVATIONS_URL     = f"{SATNOGS_NETWORK_BASE}/observations/"
GROUND_STATIONS_URL  = f"{SATNOGS_NETWORK_BASE}/stations/"
TIMEOUT              = 30.0
PAGE_SIZE            = 100
USER_AGENT           = "SovereignWatch/1.0 (SatNOGS spectrum verification; admin@sovereignwatch.local)"

# Fetch observations from a smaller window to reduce redundant paginated requests.
# Since we poll every 1 hour, a 3-hour window provides ample overlap.
OBSERVATION_WINDOW_H = 3


class SatNOGSNetworkSource(BaseSource):
    def __init__(self, client, producer, redis_client, topic, fetch_interval_h, api_token: str | None = None):
        super().__init__(client)
        self.producer     = producer
        self.redis_client = redis_client
        self.topic        = topic
        self.interval_sec = fetch_interval_h * 3600
        self.api_token    = api_token
        # In-memory cache of observation IDs seen this session to avoid re-publishing
        self._seen_ids: set[int] = set()

    async def run(self):
        while True:
            try:
                last_fetch = await self.redis_client.get("satnogs_pulse:network:last_fetch")
                now = time.time()
                if last_fetch:
                    elapsed = now - float(last_fetch)
                    if elapsed < self.interval_sec:
                        wait_sec = self.interval_sec - elapsed
                        logger.info(
                            "SatNOGS Network: cooldown active (%.1fh / %.1fh). Next in %.1fh.",
                            elapsed / 3600, self.interval_sec / 3600, wait_sec / 3600,
                        )
                        await asyncio.sleep(wait_sec)
                        continue
                else:
                    logger.info("SatNOGS Network: no prior fetch timestamp — fetching immediately on startup.")

                await self._fetch_and_publish()
                await self.redis_client.set(
                    "satnogs_pulse:network:last_fetch", str(time.time()),
                    ex=int(self.interval_sec * 2),
                )
            except Exception as e:
                logger.exception("SatNOGS Network fetch error")
                try:
                    await self.redis_client.set(
                        "poller:satnogs_network:last_error",
                        json.dumps({"ts": time.time(), "msg": str(e)}),
                        ex=86400,
                    )
                except Exception:
                    pass
            await asyncio.sleep(self.interval_sec)


    async def _fetch_and_publish(self):
        logger.info("SatNOGS Network: fetching recent observations (window=%dh)", OBSERVATION_WINDOW_H)
        fetched_at = datetime.now(UTC).isoformat()
        published  = 0

        # Only fetch observations within our window
        start_after = (datetime.now(UTC) - timedelta(hours=OBSERVATION_WINDOW_H)).strftime(
            "%Y-%m-%dT%H:%M:%S"
        )

        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        }
        if self.api_token:
            headers["Authorization"] = f"Token {self.api_token}"

        params = {
            "format":    "json",
            "status":    "good",
            "start":     start_after,
        }

        url = OBSERVATIONS_URL
        page = 1
        while url:
            try:
                # Pass params ONLY on the initial URL. Subsequent cursors from Link headers
                # will already include them.
                resp = await self.fetch_with_retry(
                    url, params=params if page == 1 else None, headers=headers
                )
                if not resp:
                    break
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                logger.error("SatNOGS Network request error on page %d: %s", page, repr(exc))
                break

            # SatNOGS API observations endpoint returns a raw list (no dict wrapper),
            # with pagination URLs provided in the RFC 5988 "Link" header.
            results = data if isinstance(data, list) else data.get("results", [])

            for obs in results:
                obs_id = obs.get("id")
                if obs_id in self._seen_ids:
                    continue
                record = self._normalise(obs, fetched_at)
                if record is None:
                    continue
                await self.producer.send(self.topic, value=record)
                if obs_id is not None:
                    self._seen_ids.add(obs_id)
                published += 1

            # Traverse pagination via "Link" header (rel="next")
            url = resp.links.get("next", {}).get("url")
            page += 1
            if url:
                # Anonymous limit is 60/hr (1/min); Authenticated is 240/hr (4/min).
                # We use a conservative 5s for anonymous and 1s for authenticated.
                delay = 1.0 if self.api_token else 5.0
                await asyncio.sleep(delay)

        # Bound in-memory dedup set to avoid unbounded growth across many intervals
        if len(self._seen_ids) > 50_000:
            self._seen_ids.clear()

        logger.info("SatNOGS Network: published %d observation records to %s", published, self.topic)

    def _normalise(self, obs: dict, fetched_at: str) -> dict | None:
        norad_id = obs.get("norad_cat_id")
        if not norad_id:
            return None

        # The SatNOGS Network API stores the observed downlink frequency as
        # "observation_frequency". Older API versions may use a legacy
        # "frequency" field instead. "transmitter_downlink_low" is the catalogue
        # expected value — use it only as a final fallback when the observed field
        # is absent (older API versions / missing data).
        freq = (
            obs.get("observation_frequency")
            or obs.get("frequency")
            or obs.get("transmitter_downlink_low")
        )

        return {
            "source":              "satnogs_network",
            "observation_id":      obs.get("id"),
            "norad_id":            str(norad_id),
            "ground_station_id":   obs.get("ground_station"),
            "transmitter_uuid":    obs.get("transmitter"),
            "frequency":           freq,              # Hz (observed downlink)
            "mode":                obs.get("transmitter_mode", ""),
            "status":              obs.get("status", "good"),
            "start":               obs.get("start"),
            "end":                 obs.get("end"),
            "has_audio":           bool(obs.get("has_audio", False)),
            "has_waterfall":       bool(obs.get("has_waterfall", False)),
            "rise_azimuth":        obs.get("rise_azimuth"),
            "set_azimuth":         obs.get("set_azimuth"),
            "max_altitude":        obs.get("max_altitude"),
            "tle0":                obs.get("tle0"),
            "tle1":                obs.get("tle1"),
            "tle2":                obs.get("tle2"),
            "vetted_status":       obs.get("vetted_status"),
            "vetted_datetime":     obs.get("vetted_datetime"),
            "fetched_at":          fetched_at,
        }
