"""
ST-DBSCAN: Spatial-Temporal Density-Based Spatial Clustering of Applications with Noise.

Pure-Python implementation — no scikit-learn dependency.
Clusters TAK entity positions using Haversine distance (km) and absolute time delta (s).
"""

import logging
import math
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class Cluster:
    """A spatially and temporally coherent group of entity observations."""

    cluster_id: int
    uids: list[str]  # deduplicated entity IDs in this cluster
    centroid_lat: float
    centroid_lon: float
    start_time: datetime
    end_time: datetime
    entity_count: int  # == len(uids)


@dataclass
class STDBSCANResult:
    """Output of detect_clusters()."""

    clusters: list[Cluster] = field(default_factory=list)
    noise_uids: list[str] = field(default_factory=list)  # UIDs with label -1


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute great-circle distance in kilometres between two lat/lon points."""
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    return r * 2.0 * math.asin(math.sqrt(a))


def _to_utc(t: object) -> Optional[datetime]:
    """Coerce a time value to a tz-aware UTC datetime, or return None on failure."""
    if isinstance(t, datetime):
        if t.tzinfo is None:
            return t.replace(tzinfo=timezone.utc)
        return t
    try:
        s = str(t).replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except (TypeError, ValueError, AttributeError):
        return None


def detect_clusters(
    points: list[dict],
    eps_km: float = 2.0,
    eps_t: float = 300.0,
    min_samples: int = 5,
) -> STDBSCANResult:
    """
    Run ST-DBSCAN over a list of entity observations.

    Args:
        points: List of dicts, each with keys:
            - uid  (str)
            - lat  (float)
            - lon  (float)
            - time (datetime or ISO string)
        eps_km:      Spatial neighbourhood radius in kilometres (default 2.0).
        eps_t:       Temporal neighbourhood half-window in seconds (default 300).
        min_samples: Minimum neighbours to classify a point as a core point (default 5).

    Returns:
        STDBSCANResult with clusters (label >= 0) and noise_uids (label -1).
    """
    if not points:
        return STDBSCANResult()

    # --- Pre-parse all points into (uid, lat, lon, time_utc) tuples -----------
    parsed: list[Optional[tuple]] = []
    for p in points:
        lat = p.get("lat")
        lon = p.get("lon")
        uid = p.get("uid")
        t = _to_utc(p.get("time"))
        if lat is None or lon is None or not uid or t is None:
            parsed.append(None)
        else:
            parsed.append((uid, float(lat), float(lon), t))

    n = len(parsed)
    labels: list[int] = [-1] * n
    visited: list[bool] = [False] * n

    def _get_neighbors(i: int) -> list[int]:
        # Consistent with standard DBSCAN: a point is its own neighbour
        # (self-distance is 0 ≤ eps_km and Δt is 0 ≤ eps_t).
        pi = parsed[i]
        if pi is None:
            return []
        _, lat_i, lon_i, t_i = pi
        neighbors = [i]  # include self
        for j in range(n):
            if j == i or parsed[j] is None:
                continue
            _, lat_j, lon_j, t_j = parsed[j]
            if abs((t_i - t_j).total_seconds()) > eps_t:
                continue
            if _haversine_km(lat_i, lon_i, lat_j, lon_j) <= eps_km:
                neighbors.append(j)
        return neighbors

    cluster_id = 0

    for i in range(n):
        if visited[i] or parsed[i] is None:
            continue
        visited[i] = True
        neighbors = _get_neighbors(i)

        if len(neighbors) < min_samples:
            # Noise (label stays -1)
            continue

        # Core point — start a new cluster
        labels[i] = cluster_id
        queue: deque[int] = deque(neighbors)

        while queue:
            j = queue.popleft()
            if not visited[j]:
                visited[j] = True
                j_neighbors = _get_neighbors(j)
                if len(j_neighbors) >= min_samples:
                    queue.extend(j_neighbors)
            if labels[j] == -1:
                labels[j] = cluster_id

        cluster_id += 1

    # --- Build result dataclasses --------------------------------------------
    # Group point indices by cluster label
    cluster_indices: dict[int, list[int]] = {}
    noise_uids: list[str] = []

    for idx, label in enumerate(labels):
        if parsed[idx] is None:
            continue
        if label == -1:
            uid = parsed[idx][0]
            if uid not in noise_uids:
                noise_uids.append(uid)
        else:
            cluster_indices.setdefault(label, []).append(idx)

    clusters: list[Cluster] = []
    for cid, indices in sorted(cluster_indices.items()):
        lats = [parsed[i][1] for i in indices]
        lons = [parsed[i][2] for i in indices]
        times = [parsed[i][3] for i in indices]
        uids_raw = [parsed[i][0] for i in indices]
        unique_uids = list(dict.fromkeys(uids_raw))  # preserve insertion order, deduplicate

        clusters.append(
            Cluster(
                cluster_id=cid,
                uids=unique_uids,
                centroid_lat=sum(lats) / len(lats),
                centroid_lon=sum(lons) / len(lons),
                start_time=min(times),
                end_time=max(times),
                entity_count=len(unique_uids),
            )
        )

    return STDBSCANResult(clusters=clusters, noise_uids=noise_uids)
