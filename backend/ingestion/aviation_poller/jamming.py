"""
SIGINT Jamming Analyzer — GPS Integrity Degradation Detection (Ingest-04).

Maintains a rolling 5-minute window of NIC/NACp values per H3 resolution-6 cell.
Publishes detected jamming zones to Redis (jamming:active_zones) for the API layer,
and optionally writes events to Kafka for the historian → TimescaleDB pipeline.

Detection logic:
  - NIC ≤ 4  (containment radius > 3 NM)  → degraded position integrity
  - NACp ≤ 6 (estimated position error > 0.1 NM) → degraded position accuracy
  - Trigger: ≥ NIC_CLUSTER_MIN aircraft in same H3-6 hex, all degraded, within 5 min

Confidence scoring (0.0–1.0):
  - Base: min(affected_count / 10, 1.0)
  - Bonus +0.2 if avg_nic ≤ 2 (very severe degradation)
  - Penalty -0.3 if current Kp > 5 (solar activity can explain GPS degradation)
  - Clamped to [0.05, 1.0]

Assessment labels:
  - confidence ≥ 0.7, Kp < 5  → 'jamming'
  - confidence < 0.3, Kp ≥ 5  → 'space_weather'
  - otherwise                   → 'mixed'
  - only 1 aircraft             → 'equipment'
"""

import json
import logging
import time
from collections import defaultdict
from typing import Dict, List, Optional

import h3
import redis.asyncio as aioredis

logger = logging.getLogger("jamming_analyzer")

# Thresholds
NIC_DEGRADED_THRESHOLD = 4      # NIC ≤ 4 → degraded integrity
NACP_DEGRADED_THRESHOLD = 6     # NACp ≤ 6 → degraded accuracy
NIC_CLUSTER_MIN = 3             # Min aircraft in a hex to trigger an event
WINDOW_SECONDS = 300            # 5-minute rolling window
KP_HIGH_THRESHOLD = 5.0         # Kp above this suppresses jamming confidence

# H3 resolution for cell grouping (res 6 ≈ 36 km edge — typical jamming radius)
H3_RESOLUTION = 6

# Redis TTL for active zones (2x the detection window so stale zones expire)
ACTIVE_ZONES_TTL = WINDOW_SECONDS * 2

# Hard ceilings on in-process state to prevent unbounded memory growth.
JAMMING_MAX_CELLS = 2_000       # Max distinct H3 cells tracked simultaneously
JAMMING_MAX_OBS_PER_CELL = 500  # Max observations retained per cell before oldest dropped


class JammingAnalyzer:
    """
    Stateful analyzer that tracks NIC/NACp observations per H3 cell and
    identifies probable GPS jamming events.
    """

    def __init__(self, redis_url: str):
        self._redis_url = redis_url
        self._redis: Optional[aioredis.Redis] = None

        # Per-cell: list of (timestamp, nic, nacp, uid) tuples
        self._cell_observations: Dict[str, List[tuple]] = defaultdict(list)

    async def start(self):
        self._redis = await aioredis.from_url(self._redis_url, decode_responses=True)

    async def close(self):
        if self._redis:
            await self._redis.aclose()

    def _is_degraded(self, nic: Optional[int], nacp: Optional[int]) -> bool:
        """Return True if either NIC or NACp indicates degraded GPS integrity."""
        if nic is not None and nic <= NIC_DEGRADED_THRESHOLD:
            return True
        if nacp is not None and nacp <= NACP_DEGRADED_THRESHOLD:
            return True
        return False

    def ingest(self, uid: str, lat: float, lon: float,
               nic: Optional[int], nacp: Optional[int]) -> None:
        """
        Record a new ADS-B observation with integrity fields.
        Called from the aviation poller's process_aircraft_batch for every aircraft
        that has NIC or NACp fields.
        """
        if not self._is_degraded(nic, nacp):
            return  # Only track degraded contacts

        try:
            cell = h3.latlng_to_cell(lat, lon, H3_RESOLUTION)
        except Exception:
            return

        now = time.time()
        if cell not in self._cell_observations and len(self._cell_observations) >= JAMMING_MAX_CELLS:
            # Evict the cell with the oldest most-recent observation to stay within cap.
            oldest_cell = min(
                self._cell_observations,
                key=lambda c: self._cell_observations[c][-1][0] if self._cell_observations[c] else 0,
            )
            del self._cell_observations[oldest_cell]
        obs = self._cell_observations[cell]
        obs.append((now, nic, nacp, uid))
        if len(obs) > JAMMING_MAX_OBS_PER_CELL:
            # Drop the oldest observation to stay within the per-cell cap.
            del obs[0]

    def _evict_stale(self) -> None:
        """Remove observations older than WINDOW_SECONDS from all cells."""
        cutoff = time.time() - WINDOW_SECONDS
        empty_cells = []
        for cell, obs in self._cell_observations.items():
            self._cell_observations[cell] = [o for o in obs if o[0] >= cutoff]
            if not self._cell_observations[cell]:
                empty_cells.append(cell)
        for cell in empty_cells:
            del self._cell_observations[cell]

    async def _get_current_kp(self) -> float:
        """Read latest Kp from Redis (written by space_weather_pulse). Default 0."""
        if not self._redis:
            return 0.0
        try:
            raw = await self._redis.get("space_weather:kp_current")
            if raw:
                return float(json.loads(raw).get("kp", 0))
        except Exception:
            pass
        return 0.0

    def _assess(self, confidence: float, kp: float, affected_count: int) -> str:
        if affected_count <= 1:
            return "equipment"
        if kp >= KP_HIGH_THRESHOLD and confidence < 0.3:
            return "space_weather"
        if confidence >= 0.65 and kp < KP_HIGH_THRESHOLD:
            return "jamming"
        return "mixed"

    async def analyze_and_publish(self) -> List[dict]:
        """
        Evaluate all active cells and publish detected jamming zones to Redis.
        Returns the list of zone dicts for logging.
        """
        self._evict_stale()

        if not self._redis:
            return []

        kp = await self._get_current_kp()
        zones = []

        for cell, obs in self._cell_observations.items():
            if len(obs) < NIC_CLUSTER_MIN:
                continue

            # Unique aircraft (de-dup by uid)
            uid_set = {o[3] for o in obs}
            affected_count = len(uid_set)

            if affected_count < NIC_CLUSTER_MIN:
                continue

            # Stats
            nics = [o[1] for o in obs if o[1] is not None]
            nacps = [o[2] for o in obs if o[2] is not None]
            avg_nic = sum(nics) / len(nics) if nics else None
            avg_nacp = sum(nacps) / len(nacps) if nacps else None

            # Confidence score
            confidence = min(affected_count / 10.0, 1.0)
            if avg_nic is not None and avg_nic <= 2:
                confidence = min(confidence + 0.2, 1.0)
            if kp > KP_HIGH_THRESHOLD:
                confidence = max(confidence - 0.3, 0.05)

            assessment = self._assess(confidence, kp, affected_count)

            # Cell centroid
            lat, lon = h3.cell_to_latlng(cell)

            zones.append({
                "h3_index": cell,
                "centroid_lat": lat,
                "centroid_lon": lon,
                "confidence": round(confidence, 3),
                "affected_count": affected_count,
                "avg_nic": round(avg_nic, 2) if avg_nic is not None else None,
                "avg_nacp": round(avg_nacp, 2) if avg_nacp is not None else None,
                "kp_at_event": kp,
                "assessment": assessment,
                "active": True,
                "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })

        # Write to Redis as GeoJSON FeatureCollection
        features = [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [z["centroid_lon"], z["centroid_lat"]]},
                "properties": {k: v for k, v in z.items()
                               if k not in ("centroid_lat", "centroid_lon")},
            }
            for z in zones
        ]
        geojson = {"type": "FeatureCollection", "features": features}
        await self._redis.setex(
            "jamming:active_zones",
            ACTIVE_ZONES_TTL,
            json.dumps(geojson),
        )

        if zones:
            logger.info(
                "Jamming analysis: %d active zone(s) | Kp=%.1f",
                len(zones), kp,
            )

        return zones
