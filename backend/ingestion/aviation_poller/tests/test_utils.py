import pytest
import math
from backend.ingestion.aviation_poller.utils import haversine_m, safe_float, parse_altitude

class TestAviationUtils:

    @pytest.mark.parametrize("lat1, lon1, lat2, lon2, expected", [
        (0, 0, 0, 0, 0.0),
        (51.5074, -0.1278, 51.5074, -0.1278, 0.0),
        # London to Paris: approx 343.5 km
        (51.5074, -0.1278, 48.8566, 2.3522, 343556.06),
        # Poles: North to South
        (90, 0, -90, 0, 20015086.796),
        # Crossing International Date Line
        (0, 179, 0, -179, 222389.85),
    ])
    def test_haversine_m(self, lat1, lon1, lat2, lon2, expected):
        result = haversine_m(lat1, lon1, lat2, lon2)
        assert pytest.approx(result, rel=1e-5) == expected

    @pytest.mark.parametrize("val, default, expected", [
        ("123.45", 0.0, 123.45),
        (123, 0.0, 123.0),
        (123.45, 0.0, 123.45),
        (None, 10.0, 10.0),
        ("invalid", 5.0, 5.0),
        ([], 2.0, 2.0),
        ({}, 3.0, 3.0),
    ])
    def test_safe_float(self, val, default, expected):
        assert safe_float(val, default) == expected

    @pytest.mark.parametrize("scenario, ac, expected", [
        ("Priority: alt_baro", {"alt_baro": 30000, "alt_geom": 31000, "alt": 30500}, 30000 * 0.3048),
        ("Priority: alt_geom (alt_baro is None)", {"alt_baro": None, "alt_geom": 31000, "alt": 30500}, 31000 * 0.3048),
        ("Priority: alt_geom (alt_baro is 'ground')", {"alt_baro": "ground", "alt_geom": 31000, "alt": 30500}, 31000 * 0.3048),
        ("Priority: alt (baro/geom are None)", {"alt_baro": None, "alt_geom": None, "alt": 30500}, 30500 * 0.3048),
        ("Priority: alt (baro/geom are 'ground')", {"alt_baro": "ground", "alt_geom": "ground", "alt": 30500}, 30500 * 0.3048),
        ("All ground", {"alt_baro": "ground", "alt_geom": "ground", "alt": "ground"}, 0.0),
        ("All None", {"alt_baro": None, "alt_geom": None, "alt": None}, 0.0),
        ("Empty dict", {}, 0.0),
        ("Invalid value in alt_baro", {"alt_baro": "invalid"}, 0.0),
        ("Float as string", {"alt_baro": "30000.5"}, 30000.5 * 0.3048),
    ])
    def test_parse_altitude(self, scenario, ac, expected):
        assert pytest.approx(parse_altitude(ac)) == expected
