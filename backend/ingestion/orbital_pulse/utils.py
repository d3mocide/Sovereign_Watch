import math
import numpy as np

def teme_to_ecef_vectorized(r, jd, fr):
    d = (jd - 2451545.0) + fr
    gmst = (18.697374558 + 24.06570982441908 * d) % 24.0
    theta = gmst * 15.0 * math.pi / 180.0

    cos_t = np.cos(theta)
    sin_t = np.sin(theta)

    x = r[:, 0]
    y = r[:, 1]
    z = r[:, 2]

    x_ecef = x * cos_t + y * sin_t
    y_ecef = -x * sin_t + y * cos_t
    z_ecef = z

    return np.column_stack((x_ecef, y_ecef, z_ecef))

def ecef_to_lla_vectorized(r_ecef):
    x = r_ecef[:, 0]
    y = r_ecef[:, 1]
    z = r_ecef[:, 2]

    a = 6378.137
    e2 = 0.00669437999014
    b = a * math.sqrt(1 - e2)
    ep2 = (a**2 - b**2) / b**2

    p = np.sqrt(x**2 + y**2)
    th = np.arctan2(a * z, b * p)

    lon = np.arctan2(y, x)
    lat = np.arctan2(z + ep2 * b * (np.sin(th)**3),
                     p - e2 * a * (np.cos(th)**3))

    N = a / np.sqrt(1 - e2 * (np.sin(lat)**2))
    alt = p / np.cos(lat) - N

    return np.degrees(lat), np.degrees(lon), alt

def compute_course(lat1, lon1, lat2, lon2):
    lat1_rad, lon1_rad = np.radians(lat1), np.radians(lon1)
    lat2_rad, lon2_rad = np.radians(lat2), np.radians(lon2)

    dlon = lon2_rad - lon1_rad
    y = np.sin(dlon) * np.cos(lat2_rad)
    x = np.cos(lat1_rad) * np.sin(lat2_rad) - np.sin(lat1_rad) * np.cos(lat2_rad) * np.cos(dlon)

    bearing = np.degrees(np.arctan2(y, x))
    return (bearing + 360) % 360
