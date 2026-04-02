import math
from typing import List

# AIS "not available" sentinels per ITU-R M.1371.
# 511 is the AIS "not available" sentinel for TrueHeading.
AIS_HEADING_NOT_AVAILABLE = 511

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

def calculate_bboxes(center_lat: float, center_lon: float, radius_nm: int) -> List[List[List[float]]]:
    """
    Calculate bounding boxes from center point and radius.
    Returns a list of bounding boxes: [ [[min_lat, min_lon], [max_lat, max_lon]], ... ]
    Handles wrapping around the antimeridian (-180 / 180 longitude).
    """
    # Simple approximation: 1 degree latitude ≈ 60nm
    # 1 degree longitude ≈ 60nm * cos(lat)

    lat_offset = radius_nm / 60.0

    # Handle poles where cos(lat) approaches 0
    cos_lat = math.cos(math.radians(center_lat))
    if abs(cos_lat) < 1e-6:
        lon_offset = 180.0
    else:
        lon_offset = radius_nm / (60.0 * cos_lat)

    # Clamp latitudes
    min_lat = max(-90.0, center_lat - lat_offset)
    max_lat = min(90.0, center_lat + lat_offset)

    # Check for wrapping around the antimeridian
    min_lon = center_lon - lon_offset
    max_lon = center_lon + lon_offset

    bboxes = []
    if min_lon < -180.0 and max_lon > 180.0:
        # If it's so large it covers the whole earth longitude-wise
        bboxes.append([[min_lat, -180.0], [max_lat, 180.0]])
    elif min_lon < -180.0:
        # Wraps around the left edge (-180)
        bboxes.append([[min_lat, min_lon + 360.0], [max_lat, 180.0]])
        bboxes.append([[min_lat, -180.0], [max_lat, max_lon]])
    elif max_lon > 180.0:
        # Wraps around the right edge (180)
        bboxes.append([[min_lat, min_lon], [max_lat, 180.0]])
        bboxes.append([[min_lat, -180.0], [max_lat, max_lon - 360.0]])
    else:
        # Normal bounding box
        bboxes.append([[min_lat, min_lon], [max_lat, max_lon]])

    return bboxes

def calculate_bbox(center_lat: float, center_lon: float, radius_nm: int) -> List[List[float]]:
    """Legacy helper for code expecting a single box. May return invalid longitude > 180 or < -180."""
    lat_offset = radius_nm / 60.0
    cos_lat = math.cos(math.radians(center_lat))
    lon_offset = radius_nm / (60.0 * cos_lat) if abs(cos_lat) >= 1e-6 else 180.0
    min_lat = max(-90.0, center_lat - lat_offset)
    max_lat = min(90.0, center_lat + lat_offset)
    min_lon = center_lon - lon_offset
    max_lon = center_lon + lon_offset
    return [[min_lat, min_lon], [max_lat, max_lon]]
