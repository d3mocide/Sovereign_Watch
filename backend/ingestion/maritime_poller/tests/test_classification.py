import pytest
from backend.ingestion.maritime_poller.classification import classify_vessel

class TestVesselClassification:
    @pytest.mark.parametrize("ship_type,expected_category", [
        # Fishing
        (30, "fishing"),
        # Tugs / towing
        (31, "tug"),
        (32, "tug"),
        (52, "tug"),
        # Dredging / diving
        (33, "dredging"),
        (34, "diving"),
        # Military
        (35, "military"),
        # Pleasure craft
        (36, "pleasure"),
        (37, "pleasure"),
        (170, "pleasure"),
        (175, "pleasure"),
        (179, "pleasure"),
        # High-speed craft
        (40, "hsc"),
        (45, "hsc"),
        (49, "hsc"),
        # Special port services
        (50, "pilot"),
        (51, "sar"),
        (53, "port_tender"),
        (54, "anti_pollution"),
        (55, "law_enforcement"),
        (58, "special"),
        (59, "special"),
        # Passenger
        (60, "passenger"),
        (65, "passenger"),
        (69, "passenger"),
        # Cargo
        (70, "cargo"),
        (75, "cargo"),
        (79, "cargo"),
        # Tanker
        (80, "tanker"),
        (85, "tanker"),
        (89, "tanker"),
        # Other / unknown
        (90, "other"),
        (0, "unknown"),
        (99, "unknown"),
    ])
    def test_category_mapping(self, ship_type, expected_category):
        result = classify_vessel(ship_type, 123456789, "Test Vessel")
        assert result["category"] == expected_category

    @pytest.mark.parametrize("ship_type,expected_hazardous", [
        (70, False), # cargo, units 0
        (71, True),  # cargo, units 1
        (74, True),  # cargo, units 4
        (75, False), # cargo, units 5
        (81, True),  # tanker, units 1
        (62, True),  # passenger, units 2
        (43, True),  # hsc, units 3
        (31, False), # tug, units 1 (not in hazardous-eligible categories)
    ])
    def test_hazardous_logic(self, ship_type, expected_hazardous):
        result = classify_vessel(ship_type, 123456789, "Test Vessel")
        assert result["hazardous"] == expected_hazardous

    @pytest.mark.parametrize("mmsi,expected_station,expected_mid", [
        (235000000, "ship", 235),
        (235123456, "ship", 235),
        ("002351234", "coastal", 235),
        ("023512345", "group", 235),
        ("111235123", "sar_aircraft", 235),
        ("823512345", "handheld", 235),
        ("982351234", "craft_associated", 235),
        ("992351234", "navaid", 235),
        ("123456789", "ship", 123),
    ])
    def test_mmsi_parsing(self, mmsi, expected_station, expected_mid):
        result = classify_vessel(70, mmsi, "Test Vessel")
        assert result["stationType"] == expected_station
        assert result["flagMid"] == expected_mid

    def test_return_structure(self):
        result = classify_vessel(70, 235123456, "Cargo Ship")
        assert "category" in result
        assert "shipType" in result
        assert "hazardous" in result
        assert "stationType" in result
        assert "flagMid" in result
        assert result["shipType"] == 70

    # ------------------------------------------------------------------
    # Name-based heuristic fallback (ship_type=0 → primary → "unknown",
    # then secondary tier runs on the vessel name)
    # ------------------------------------------------------------------
    @pytest.mark.parametrize("name,expected_category", [
        # Tug / towing fleet names
        ("FOSS TITAN", "tug"),
        ("OCEAN PUSH", "tug"),
        ("VALIANT STAR", "tug"),
        ("TOW MASTER", "tug"),
        # Passenger / ferry
        ("WSF WALLA WALLA", "passenger"),
        ("SPIRIT OF SEATTLE", "passenger"),
        ("QUEEN OF THE SEAS", "passenger"),
        ("VANCOUVER FERRY", "passenger"),
        ("ISLAND BREEZE", "passenger"),
        # Military
        ("USS JOHN PAUL JONES", "military"),
        ("USNS COMFORT", "military"),
        ("CGC BERTHOLF", "military"),
        ("RFA FORT VICTORIA", "military"),
        # Pilot
        ("PILOT BOAT 1", "pilot"),
        ("PORT PLT 3", "pilot"),
        # Fishing
        ("F/V ALASKA PIONEER", "fishing"),
        ("FV OCEAN DAWN", "fishing"),
        ("TRAWLER QUEEN", "fishing"),
        ("DUNGENESS CRABBER", "fishing"),
        # SAR
        ("RESCUE 1", "sar"),
        ("LIFEBOAT 47", "sar"),
        ("SAR VESSEL", "sar"),
        # Pleasure / yachts
        ("MY SERENITY", "pleasure"),
        ("S/V WANDERER", "pleasure"),
        ("SY PACIFIC DREAMS", "pleasure"),
        ("OCEAN YACHT", "pleasure"),
        # Law enforcement
        ("POLICE PATROL 1", "law_enforcement"),
        ("SHERIFF BOAT", "law_enforcement"),
        ("HARBOR PATROL", "law_enforcement"),
        # Unrecognised names stay as "unknown"
        ("GENERIC VESSEL 42", "unknown"),
    ])
    def test_name_heuristics(self, name, expected_category):
        # ship_type=0 forces "unknown" from primary tier, triggering heuristic fallback
        result = classify_vessel(0, 123456789, name)
        assert result["category"] == expected_category, (
            f"Name '{name}' expected '{expected_category}', got '{result['category']}'"
        )

    def test_name_heuristics_only_apply_to_unknown_other_special(self):
        # A confirmed cargo vessel (type 70) must NOT be overridden by a name that
        # contains a tug keyword — primary classification wins.
        result = classify_vessel(70, 123456789, "FOSS CARGO EXPRESS")
        assert result["category"] == "cargo"

    def test_none_name_does_not_raise(self):
        # AISStream may omit the name before static data arrives; must not crash.
        result = classify_vessel(0, 123456789, None)
        assert result["category"] == "unknown"

    def test_empty_name_does_not_raise(self):
        result = classify_vessel(70, 123456789, "")
        assert result["category"] == "cargo"
