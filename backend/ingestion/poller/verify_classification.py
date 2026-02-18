import unittest
import sys
import os
from typing import Dict
from unittest.mock import MagicMock

# Mock missing dependencies
sys.modules["aiokafka"] = MagicMock()
sys.modules["redis"] = MagicMock()
sys.modules["redis.asyncio"] = MagicMock()
sys.modules["multi_source_poller"] = MagicMock()

# Add current directory to path so we can import main
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from main import classify_aircraft, PollerService

class TestADSBClassification(unittest.TestCase):
    def setUp(self):
        # Create a partial mock of PollerService to test normalize_to_tak
        # We bypass __init__ to avoid connecting to Kafka/Redis
        self.service = PollerService.__new__(PollerService)
        # Initialize only what's needed for normalize_to_tak
        self.service._arbi_cache = {} 
        self.service.center_lat = 0.0
        self.service.center_lon = 0.0
        self.service.radius_nm = 100

    def test_military_by_db_flags(self):
        ac = {"hex": "ABCDEF", "dbFlags": 1, "t": "F16", "r": "AF123"}
        result = classify_aircraft(ac)
        self.assertEqual(result["affiliation"], "military")

    def test_military_by_operator(self):
        ac = {"hex": "ABCDEF", "ownOp": "United States Air Force", "t": "CS30"}
        result = classify_aircraft(ac)
        self.assertEqual(result["affiliation"], "military")

    def test_gov_by_operator(self):
        ac = {"hex": "ABCDEF", "ownOp": "FBI", "t": "C172"}
        result = classify_aircraft(ac)
        self.assertEqual(result["affiliation"], "government")

    def test_military_by_hex_range(self):
        ac = {"hex": "AE0123", "t": "UNKNOWN"} # In AE0000-AFFFFF
        result = classify_aircraft(ac)
        self.assertEqual(result["affiliation"], "military")

    def test_commercial_by_callsign(self):
        ac = {"hex": "AABBCC", "flight": "UAL1234", "category": "A3"}
        result = classify_aircraft(ac)
        self.assertEqual(result["affiliation"], "commercial")

    def test_commercial_by_category(self):
        ac = {"hex": "AABBCC", "category": "A5"}
        result = classify_aircraft(ac)
        self.assertEqual(result["affiliation"], "commercial")
        self.assertEqual(result["size"], "high_performance")

    def test_general_aviation_default(self):
        ac = {"hex": "AABBCC", "flight": "N12345", "category": "A1"}
        result = classify_aircraft(ac)
        self.assertEqual(result["affiliation"], "general_aviation")
        self.assertEqual(result["size"], "light")

    def test_platforms(self):
        # Helicopter by category
        self.assertEqual(classify_aircraft({"category": "A7"})["platform"], "helicopter")
        # Helicopter by type code
        self.assertEqual(classify_aircraft({"t": "H60"})["platform"], "helicopter")
        # Drone
        self.assertEqual(classify_aircraft({"category": "B6"})["platform"], "drone")
        # Balloon
        self.assertEqual(classify_aircraft({"category": "B2"})["platform"], "balloon")
        # Glider
        self.assertEqual(classify_aircraft({"category": "B1"})["platform"], "glider")
        # High Perf
        self.assertEqual(classify_aircraft({"category": "A6"})["platform"], "high_performance")

    def test_cot_type_derivation(self):
        base_ac = {"lat": 10.0, "lon": 10.0, "hex": "abcdef"}
        
        # Mil Heli
        ac = {**base_ac, "dbFlags": 1, "category": "A7"}
        tak = self.service.normalize_to_tak(ac)
        self.assertEqual(tak["type"], "a-f-A-M-H")
        
        # Mil Fixed
        ac = {**base_ac, "dbFlags": 1, "t": "F35"}
        tak = self.service.normalize_to_tak(ac)
        self.assertEqual(tak["type"], "a-f-A-M-F")
        
        # Civ Heli
        ac = {**base_ac, "category": "A7"}
        tak = self.service.normalize_to_tak(ac)
        self.assertEqual(tak["type"], "a-f-A-C-H")
        
        # Civ Fixed
        ac = {**base_ac, "category": "A1"}
        tak = self.service.normalize_to_tak(ac)
        self.assertEqual(tak["type"], "a-f-A-C-F")
        
        # Drone
        ac = {**base_ac, "category": "B6"}
        tak = self.service.normalize_to_tak(ac)
        # Using Q for drone or generic F depending on implementation. 
        # In my impl I put "a-f-A-C-Q"
        self.assertEqual(tak["type"], "a-f-A-C-Q")

        # Maritime (should override everything)
        ac = {**base_ac, "category": "C1"}
        tak = self.service.normalize_to_tak(ac)
        self.assertEqual(tak["type"], "a-f-S-C-M")

if __name__ == '__main__':
    unittest.main()
