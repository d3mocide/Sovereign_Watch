import math
from typing import List

def calculate_distance_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in nautical miles."""
    R = 3440.065  # Earth radius in nautical miles
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2) * math.sin(dLat/2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dLon/2) * math.sin(dLon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def calculate_bbox(center_lat: float, center_lon: float, radius_nm: int) -> List[List[float]]:
    """
    Calculate bounding box from center point and radius.
    Returns [[min_lat, min_lon], [max_lat, max_lon]]
    """
    # Simple approximation: 1 degree latitude ≈ 60nm
    # 1 degree longitude ≈ 60nm * cos(lat)

    lat_offset = radius_nm / 60.0
    lon_offset = radius_nm / (60.0 * math.cos(math.radians(center_lat)))

    # BUG-020: Unclamped offsets can exceed ±90° for large radii or polar centers,
    # producing invalid coordinates that AISStream may reject or silently ignore.
    min_lat = max(-90.0, center_lat - lat_offset)
    max_lat = min(90.0, center_lat + lat_offset)
    min_lon = center_lon - lon_offset
    max_lon = center_lon + lon_offset

    # AISStream format: [[min_lat, min_lon], [max_lat, max_lon]]
    return [[min_lat, min_lon], [max_lat, max_lon]]
