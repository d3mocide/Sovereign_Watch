"""
Unit tests for ST-DBSCAN clustering service.

Tests cover: empty input, single cluster, noise points, temporal separation.
No database or external dependencies required.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.stdbscan import STDBSCANResult, detect_clusters


def _make_point(
    uid: str,
    lat: float,
    lon: float,
    t: datetime,
) -> dict:
    return {"uid": uid, "lat": lat, "lon": lon, "time": t}


_BASE_TIME = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


class TestDetectClustersEmpty:
    def test_empty_list_returns_empty_result(self):
        result = detect_clusters([])
        assert isinstance(result, STDBSCANResult)
        assert result.clusters == []
        assert result.noise_uids == []

    def test_invalid_points_only(self):
        """Points missing required fields are skipped — treated as empty."""
        points = [
            {"uid": "a", "lat": None, "lon": 0.0, "time": _BASE_TIME},
            {"uid": "b", "lat": 0.0, "lon": None, "time": _BASE_TIME},
            {"uid": "c", "lat": 0.0, "lon": 0.0, "time": None},
        ]
        result = detect_clusters(points, min_samples=1)
        # All points are invalid and will be skipped
        assert result.clusters == []


class TestDetectClustersSingleCluster:
    def test_tight_group_forms_one_cluster(self):
        """Six distinct UIDs within 1 km / 60 s should form exactly one cluster."""
        # All points very close to (0.000, 0.000) — well within eps_km=2.0
        points = [
            _make_point(f"uid-{i}", 0.0 + i * 0.001, 0.0 + i * 0.001, _BASE_TIME)
            for i in range(6)
        ]
        result = detect_clusters(points, eps_km=2.0, eps_t=300, min_samples=5)

        assert len(result.clusters) == 1
        cluster = result.clusters[0]
        assert cluster.cluster_id == 0
        assert cluster.entity_count == 6
        assert set(cluster.uids) == {f"uid-{i}" for i in range(6)}
        assert result.noise_uids == []

    def test_centroid_is_mean_of_positions(self):
        lats = [1.0, 1.0, 1.0, 1.0, 1.0, 2.0]
        lons = [2.0, 2.0, 2.0, 2.0, 2.0, 2.0]
        points = [
            _make_point(f"uid-{i}", lats[i], lons[i], _BASE_TIME)
            for i in range(6)
        ]
        result = detect_clusters(points, eps_km=200.0, eps_t=300, min_samples=5)
        assert len(result.clusters) == 1
        c = result.clusters[0]
        expected_lat = sum(lats) / len(lats)
        expected_lon = sum(lons) / len(lons)
        assert abs(c.centroid_lat - expected_lat) < 1e-9
        assert abs(c.centroid_lon - expected_lon) < 1e-9

    def test_start_end_time_bounds(self):
        times = [_BASE_TIME + timedelta(seconds=i * 10) for i in range(6)]
        points = [
            _make_point(f"uid-{i}", 0.0, 0.0, times[i]) for i in range(6)
        ]
        result = detect_clusters(points, eps_km=2.0, eps_t=300, min_samples=5)
        assert len(result.clusters) == 1
        c = result.clusters[0]
        assert c.start_time == times[0]
        assert c.end_time == times[-1]

    def test_fewer_than_min_samples_produces_no_cluster(self):
        points = [
            _make_point(f"uid-{i}", 0.0, 0.0, _BASE_TIME) for i in range(4)
        ]
        result = detect_clusters(points, eps_km=2.0, eps_t=300, min_samples=5)
        assert result.clusters == []


class TestDetectClustersNoisePoints:
    def test_nearby_cluster_plus_far_noise(self):
        """
        5 points near origin (cluster) + 2 points far away (noise).
        eps_km=2.0, so ~2000 km away won't be neighbours.
        """
        near = [
            _make_point(f"near-{i}", 0.0 + i * 0.001, 0.0 + i * 0.001, _BASE_TIME)
            for i in range(5)
        ]
        far = [
            _make_point("far-0", 50.0, 50.0, _BASE_TIME),
            _make_point("far-1", 51.0, 51.0, _BASE_TIME),
        ]
        result = detect_clusters(near + far, eps_km=2.0, eps_t=300, min_samples=5)

        assert len(result.clusters) == 1
        assert result.clusters[0].entity_count == 5
        # Both far points should be noise
        assert set(result.noise_uids) == {"far-0", "far-1"}

    def test_noise_count(self):
        near = [
            _make_point(f"n-{i}", 0.0 + i * 0.0001, 0.0, _BASE_TIME) for i in range(5)
        ]
        far = [_make_point("noise", 80.0, 80.0, _BASE_TIME)]
        result = detect_clusters(near + far, eps_km=2.0, eps_t=300, min_samples=5)
        assert "noise" in result.noise_uids


class TestDetectClustersTemporalSeparation:
    def test_same_location_different_time_stays_noise(self):
        """
        All points at the same (lat, lon) but spaced > eps_t apart.
        No point should have enough temporal neighbours → all noise.
        """
        eps_t = 60  # 60 s window
        # Space each point 120 s apart — each has 0 neighbours within eps_t
        points = [
            _make_point(
                f"uid-{i}",
                0.0,
                0.0,
                _BASE_TIME + timedelta(seconds=i * 120),
            )
            for i in range(6)
        ]
        result = detect_clusters(points, eps_km=2.0, eps_t=eps_t, min_samples=2)
        assert result.clusters == []
        # All 6 should be noise
        assert len(result.noise_uids) == 6

    def test_temporal_window_allows_clustering_within_eps(self):
        """Points within eps_t of each other SHOULD cluster spatially."""
        eps_t = 300
        # Space 10 s apart — all within eps_t of each other
        points = [
            _make_point(
                f"uid-{i}",
                0.0 + i * 0.0001,
                0.0,
                _BASE_TIME + timedelta(seconds=i * 10),
            )
            for i in range(6)
        ]
        result = detect_clusters(points, eps_km=2.0, eps_t=eps_t, min_samples=5)
        assert len(result.clusters) == 1

    def test_two_temporal_groups_no_spatial_separation(self):
        """
        Same location but two time groups separated by > eps_t.
        Each group has min_samples points but cannot see the other group's points
        as neighbours.  Both groups should form independent clusters.
        """
        eps_t = 60
        group_a = [
            _make_point(f"a-{i}", 0.0, 0.0, _BASE_TIME + timedelta(seconds=i * 5))
            for i in range(5)
        ]
        # Start group_b more than eps_t after group_a ends
        offset = timedelta(seconds=200)
        group_b = [
            _make_point(
                f"b-{i}",
                0.0,
                0.0,
                _BASE_TIME + offset + timedelta(seconds=i * 5),
            )
            for i in range(5)
        ]
        result = detect_clusters(group_a + group_b, eps_km=2.0, eps_t=eps_t, min_samples=5)
        assert len(result.clusters) == 2
        cluster_uid_sets = [set(c.uids) for c in result.clusters]
        assert {f"a-{i}" for i in range(5)} in cluster_uid_sets
        assert {f"b-{i}" for i in range(5)} in cluster_uid_sets
