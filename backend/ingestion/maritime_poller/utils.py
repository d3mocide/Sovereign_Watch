import math
from typing import List

def calculate_bbox(center_lat: float, center_lon: float, radius_nm: int) -> List[List[float]]:
    """
    Calculate bounding box from center point and radius.
    Returns [[min_lat, min_lon], [max_lat, max_lon]]
    """
    # Simple approximation: 1 degree latitude ≈ 60nm
    # 1 degree longitude ≈ 60nm * cos(lat)

    lat_offset = radius_nm / 60.0
    lon_offset = radius_nm / (60.0 * math.cos(math.radians(center_lat)))

    min_lat = center_lat - lat_offset
    max_lat = center_lat + lat_offset
    min_lon = center_lon - lon_offset
    max_lon = center_lon + lon_offset

    # AISStream format: [[min_lat, min_lon], [max_lat, max_lon]]
    return [[min_lat, min_lon], [max_lat, max_lon]]
