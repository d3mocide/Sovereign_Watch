import pytest
from backend.ingestion.maritime_poller.utils import calculate_bbox

class TestMaritimeUtils:
    def test_calculate_bbox_equator(self):
        """Test bbox calculation at the equator where 1 degree ≈ 60nm for both lat and lon."""
        center_lat, center_lon, radius = 0.0, 0.0, 60
        bbox = calculate_bbox(center_lat, center_lon, radius)
        # lat_offset = 60/60 = 1.0
        # lon_offset = 60/(60*cos(0)) = 1.0
        assert bbox == [[-1.0, -1.0], [1.0, 1.0]]

    def test_calculate_bbox_high_latitude(self):
        """Test bbox calculation at high latitude where longitude degrees are smaller."""
        # At 60 degrees N, cos(60°) = 0.5.
        # lat_offset = 60/60 = 1.0
        # lon_offset = 60/(60 * 0.5) = 2.0
        center_lat, center_lon, radius = 60.0, 0.0, 60
        bbox = calculate_bbox(center_lat, center_lon, radius)

        assert bbox[0][0] == 59.0
        assert bbox[1][0] == 61.0
        assert pytest.approx(bbox[0][1]) == -2.0
        assert pytest.approx(bbox[1][1]) == 2.0

    def test_calculate_bbox_north_pole_clamping(self):
        """Test that latitude is clamped at +90 degrees."""
        center_lat, center_lon, radius = 89.5, 0.0, 60
        bbox = calculate_bbox(center_lat, center_lon, radius)
        assert bbox[1][0] == 90.0
        assert bbox[0][0] == 88.5

    def test_calculate_bbox_south_pole_clamping(self):
        """Test that latitude is clamped at -90 degrees."""
        center_lat, center_lon, radius = -89.5, 0.0, 60
        bbox = calculate_bbox(center_lat, center_lon, radius)
        assert bbox[0][0] == -90.0
        assert bbox[1][0] == -88.5

    def test_calculate_bbox_zero_radius(self):
        """Test bbox with zero radius returns the center point."""
        center_lat, center_lon, radius = 45.0, -122.0, 0
        bbox = calculate_bbox(center_lat, center_lon, radius)
        assert bbox == [[45.0, -122.0], [45.0, -122.0]]

    def test_calculate_bbox_large_radius(self):
        """Test that large radii clamp latitude to global limits."""
        center_lat, center_lon, radius = 0.0, 0.0, 6000 # 100 degrees
        bbox = calculate_bbox(center_lat, center_lon, radius)
        assert bbox[0][0] == -90.0
        assert bbox[1][0] == 90.0
