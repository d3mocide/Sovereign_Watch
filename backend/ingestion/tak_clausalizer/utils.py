import math
from typing import Any, Optional


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in metres between two WGS-84 coordinates."""
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def safe_float(val: Any, default: Optional[float] = None) -> Optional[float]:
    """Safely convert any value to float, returning *default* on failure.

    Pass ``default=0.0`` (or any numeric value) when a non-None fallback is
    required.  Leave *default* as ``None`` (the new default) when a missing or
    unparseable value should be detected by the caller.
    """
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default
