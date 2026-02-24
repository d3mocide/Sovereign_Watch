import math
from typing import Dict, Any, Optional

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in metres between two WGS-84 coordinates."""
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def safe_float(val: Any, default: float = 0.0) -> float:
    """Safely convert any value to float."""
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default

def parse_altitude(ac: Dict[str, Any]) -> float:
    """Safely parse altitude from multiple possible keys (baro, geom, alt)."""
    # Try keys in order of preference
    val = ac.get("alt_baro")
    if val is None or val == "ground":
        val = ac.get("alt_geom")
    if val is None or val == "ground":
        val = ac.get("alt")

    if val is None or val == "ground":
        return 0.0

    try:
        return float(val) * 0.3048  # Feet to Meters
    except (TypeError, ValueError):
        return 0.0
