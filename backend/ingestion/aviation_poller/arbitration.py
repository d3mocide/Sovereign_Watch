import time
from typing import Dict
from utils import haversine_m

# Arbitration cache constants
# Minimum elapsed source-time before the same hex will be re-published.
ARBI_MIN_DELTA_S = 0.5

# Minimum spatial displacement (metres) that bypasses the temporal gate.
ARBI_MIN_SPATIAL_M = 100.0

# How long (seconds) to retain an entry in the cache after last publish.
ARBI_TTL_S = 30.0

# Hard ceiling on the number of aircraft tracked simultaneously.
# If exceeded, the stalest entry is evicted before recording the new one.
ARBI_MAX_ENTRIES = 5_000


class Arbitrator:
    def __init__(self):
        # Per-hex arbitration cache: hex -> {"ts": float, "lat": float, "lon": float, "wall": float}
        self._arbi_cache: Dict[str, Dict] = {}

    def evict_stale_entries(self) -> None:
        """Remove cache entries for aircraft not seen recently to reclaim memory."""
        now = time.time()
        stale = [hex_id for hex_id, entry in self._arbi_cache.items()
                 if now - entry["wall"] > ARBI_TTL_S]
        for hex_id in stale:
            del self._arbi_cache[hex_id]

    def should_publish(self, hex_id: str, source_ts: float, lat: float, lon: float) -> bool:
        """
        Arbitration gate: return True only if this position update is worth
        publishing to Kafka.
        """
        entry = self._arbi_cache.get(hex_id)
        if entry is None:
            return True

        # Temporal Check
        delta_ts = source_ts - entry["ts"]
        if delta_ts >= ARBI_MIN_DELTA_S:
            return True

        # Spatial Bypass (only if time check failed but it's a new packet)
        if delta_ts > 0:
            dist = haversine_m(entry["lat"], entry["lon"], lat, lon)
            if dist > ARBI_MIN_SPATIAL_M:
                return True

        return False

    def record_publish(self, hex_id: str, source_ts: float, lat: float, lon: float) -> None:
        """Update the arbitration cache after a successful publish."""
        if len(self._arbi_cache) >= ARBI_MAX_ENTRIES and hex_id not in self._arbi_cache:
            # Evict the stalest entry to stay within the hard cap.
            oldest = min(self._arbi_cache, key=lambda k: self._arbi_cache[k]["wall"])
            del self._arbi_cache[oldest]
        self._arbi_cache[hex_id] = {
            "ts": source_ts,
            "lat": lat,
            "lon": lon,
            "wall": time.time(),
        }
