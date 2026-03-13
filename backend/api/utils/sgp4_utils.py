"""
SGP4 coordinate-transform helpers for the orbital pass prediction API.

Functions are ported from backend/ingestion/orbital_pulse/utils.py, with the
addition of ecef_to_topocentric which converts observer + satellite ECEF
vectors to observer-relative azimuth, elevation and slant-range.
"""
import math
import numpy as np


def teme_to_ecef(r_teme: np.ndarray, jd: float, fr: float) -> np.ndarray:
    """
    Rotate a single TEME position vector (km) to ECEF using GMST.

    Parameters
    ----------
    r_teme : (3,) ndarray
    jd     : Julian date (integer part)
    fr     : Julian date (fractional part)

    Returns
    -------
    (3,) ndarray in ECEF km
    """
    d = (jd - 2451545.0) + fr
    gmst = (18.697374558 + 24.06570982441908 * d) % 24.0
    theta = gmst * 15.0 * math.pi / 180.0

    cos_t = math.cos(theta)
    sin_t = math.sin(theta)

    x, y, z = r_teme
    return np.array([
        x * cos_t + y * sin_t,
        -x * sin_t + y * cos_t,
        z,
    ])



def ecef_to_lla_vectorized(r_ecef: np.ndarray):
    """
    Convert an (N, 3) ECEF array (km) to (lat_deg, lon_deg, alt_km).

    Returns three (N,) arrays: lat_deg, lon_deg, alt_km.
    """
    x = r_ecef[:, 0]
    y = r_ecef[:, 1]
    z = r_ecef[:, 2]

    a = 6378.137
    e2 = 0.00669437999014
    b = a * math.sqrt(1 - e2)
    ep2 = (a ** 2 - b ** 2) / b ** 2

    p = np.sqrt(x ** 2 + y ** 2)
    th = np.arctan2(a * z, b * p)

    lon = np.arctan2(y, x)
    lat = np.arctan2(
        z + ep2 * b * (np.sin(th) ** 3),
        p - e2 * a * (np.cos(th) ** 3),
    )

    N = a / np.sqrt(1 - e2 * (np.sin(lat) ** 2))
    safe_lat = np.clip(lat, -np.pi / 2 + 1e-9, np.pi / 2 - 1e-9)
    alt = p / np.cos(safe_lat) - N

    return np.degrees(lat), np.degrees(lon), alt


def geodetic_to_ecef(lat_deg: float, lon_deg: float, alt_km: float = 0.0) -> np.ndarray:
    """
    Convert WGS-84 geodetic coordinates to ECEF (km).

    Parameters
    ----------
    lat_deg : observer geodetic latitude in degrees
    lon_deg : observer geodetic longitude in degrees
    alt_km  : observer altitude above ellipsoid in km (default 0)

    Returns
    -------
    (3,) ndarray in ECEF km
    """
    a = 6378.137
    e2 = 0.00669437999014

    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)

    N = a / math.sqrt(1 - e2 * math.sin(lat) ** 2)

    x = (N + alt_km) * math.cos(lat) * math.cos(lon)
    y = (N + alt_km) * math.cos(lat) * math.sin(lon)
    z = (N * (1 - e2) + alt_km) * math.sin(lat)

    return np.array([x, y, z])


def ecef_to_topocentric(
    obs_ecef: np.ndarray,
    sat_ecef: np.ndarray,
    obs_lat_deg: float,
    obs_lon_deg: float,
) -> tuple[float, float, float]:
    """
    Compute observer-relative azimuth, elevation, and slant-range.

    Parameters
    ----------
    obs_ecef    : (3,) observer ECEF position (km)
    sat_ecef    : (3,) satellite ECEF position (km)
    obs_lat_deg : observer geodetic latitude (degrees)
    obs_lon_deg : observer geodetic longitude (degrees)

    Returns
    -------
    (azimuth_deg, elevation_deg, slant_range_km)
    """
    # Range vector from observer to satellite
    diff = sat_ecef - obs_ecef
    slant_range_km = float(np.linalg.norm(diff))

    lat = math.radians(obs_lat_deg)
    lon = math.radians(obs_lon_deg)

    # ENU rotation matrix rows
    # East:  (-sin_lon,  cos_lon,        0)
    # North: (-sin_lat*cos_lon, -sin_lat*sin_lon,  cos_lat)
    # Up:    ( cos_lat*cos_lon,  cos_lat*sin_lon,  sin_lat)
    sin_lat = math.sin(lat)
    cos_lat = math.cos(lat)
    sin_lon = math.sin(lon)
    cos_lon = math.cos(lon)

    east  = np.array([-sin_lon,               cos_lon,              0.0])
    north = np.array([-sin_lat * cos_lon, -sin_lat * sin_lon,  cos_lat])
    up    = np.array([ cos_lat * cos_lon,  cos_lat * sin_lon,  sin_lat])

    e = float(np.dot(diff, east))
    n = float(np.dot(diff, north))
    u = float(np.dot(diff, up))

    elevation_rad = math.atan2(u, math.sqrt(e ** 2 + n ** 2))
    azimuth_rad   = math.atan2(e, n)  # measured from North, clockwise

    azimuth_deg   = math.degrees(azimuth_rad) % 360.0
    elevation_deg = math.degrees(elevation_rad)

    return azimuth_deg, elevation_deg, slant_range_km
