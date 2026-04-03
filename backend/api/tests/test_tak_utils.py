import pytest
import os
import sys

# Add the api directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from services.tak import to_epoch, to_float, transform_to_proto
    from proto.tak_pb2 import TakMessage

    PROTO_AVAILABLE = True
except ImportError:
    import sys
    from unittest.mock import MagicMock

    # Mock the proto module and its dependencies to allow testing of non-proto functions
    mock_proto = MagicMock()
    sys.modules["proto"] = mock_proto
    sys.modules["proto.tak_pb2"] = mock_proto.tak_pb2
    sys.modules["google"] = MagicMock()
    sys.modules["google.protobuf"] = MagicMock()

    from services.tak import to_epoch, to_float, transform_to_proto
    from proto.tak_pb2 import TakMessage

    PROTO_AVAILABLE = False


def test_to_epoch_none():
    assert to_epoch(None) == 0


def test_to_epoch_numeric():
    assert to_epoch(123) == 123
    assert to_epoch(123.456) == 123


def test_to_epoch_iso_string():
    # 2024-05-20T12:00:00Z -> 1716206400000 ms
    val = "2024-05-20T12:00:00Z"
    expected = 1716206400000
    assert to_epoch(val) == expected

    val_no_z = "2024-05-20T12:00:00+00:00"
    assert to_epoch(val_no_z) == expected


def test_to_epoch_invalid():
    assert to_epoch("not a date") == 0
    assert to_epoch([]) == 0


def test_to_float_none():
    assert to_float(None) == 0.0
    assert to_float(None, default=1.0) == 1.0


def test_to_float_valid():
    assert to_float("123.45") == 123.45
    assert to_float(123) == 123.0
    assert to_float(123.45) == 123.45


def test_to_float_invalid():
    assert to_float("abc") == 0.0
    assert to_float("abc", default=5.0) == 5.0


@pytest.mark.skipif(not PROTO_AVAILABLE, reason="Protobuf not available in environment")
def test_transform_to_proto_full():
    data = {
        "uid": "test-uid",
        "type": "a-f-G",
        "start": "2024-05-20T12:00:00Z",
        "stale": "2024-05-20T12:05:00Z",
        "time": "2024-05-20T12:00:00Z",
        "how": "m-g",
        "point": {"lat": 34.05, "lon": -118.24, "hae": 100.0, "ce": 10.0, "le": 5.0},
        "detail": {
            "track": {"course": 90.0, "speed": 15.0, "vspeed": 0.0},
            "contact": {"callsign": "TEST1"},
            "classification": {
                "affiliation": "FRIEND",
                "platform": "AIR",
                "size": "LARGE",
                "icaoType": "B744",
                "category": "Aviation",
                "dbFlags": 1,
                "operator": "TestAir",
                "registration": "N12345",
                "description": "A big plane",
                "squawk": "1234",
                "emergency": "None",
            },
            "vesselClassification": {
                "category": "Cargo",
                "shipType": 70,
                "navStatus": 0,
                "hazardous": False,
                "stationType": "Class A",
                "flagMid": 366,
                "imo": 1234567,
                "callsign": "WXYZ",
                "destination": "London",
                "draught": 10.5,
                "length": 300.0,
                "beam": 40.0,
            },
        },
    }

    result = transform_to_proto(data)

    # Check magic bytes
    assert result.startswith(bytes([0xBF, 0x01, 0xBF]))

    # Deserialize remaining bytes
    payload = result[3:]
    tak_msg = TakMessage()
    tak_msg.ParseFromString(payload)

    cot = tak_msg.cotEvent
    assert cot.uid == "test-uid"
    assert cot.type == "a-f-G"
    assert cot.start == 1716206400000
    assert cot.stale == 1716206700000
    assert cot.time == 1716206400000
    assert cot.how == "m-g"

    assert cot.lat == pytest.approx(34.05)
    assert cot.lon == pytest.approx(-118.24)
    assert cot.hae == pytest.approx(100.0)
    assert cot.ce == pytest.approx(10.0)
    assert cot.le == pytest.approx(5.0)

    assert cot.detail.track.course == pytest.approx(90.0)
    assert cot.detail.track.speed == pytest.approx(15.0)
    assert cot.detail.track.vspeed == pytest.approx(0.0)

    assert cot.detail.contact.callsign == "TEST1"

    cls = cot.detail.classification
    assert cls.affiliation == "FRIEND"
    assert cls.platform == "AIR"
    assert cls.size_class == "LARGE"
    assert cls.icao_type == "B744"
    assert cls.category == "Aviation"
    assert cls.db_flags == 1
    assert cls.operator == "TestAir"
    assert cls.registration == "N12345"
    assert cls.description == "A big plane"
    assert cls.squawk == "1234"
    assert cls.emergency == "None"

    vc = cot.detail.vesselClassification
    assert vc.category == "Cargo"
    assert vc.ship_type == 70
    assert vc.nav_status == 0
    assert vc.hazardous is False
    assert vc.station_type == "Class A"
    assert vc.flag_mid == 366
    assert vc.imo == 1234567
    assert vc.callsign == "WXYZ"
    assert vc.destination == "London"
    assert vc.draught == pytest.approx(10.5)
    assert vc.length == pytest.approx(300.0)
    assert vc.beam == pytest.approx(40.0)


@pytest.mark.skipif(not PROTO_AVAILABLE, reason="Protobuf not available in environment")
def test_transform_to_proto_minimal():
    data = {"uid": "min-uid"}
    result = transform_to_proto(data)
    assert result.startswith(bytes([0xBF, 0x01, 0xBF]))

    payload = result[3:]
    tak_msg = TakMessage()
    tak_msg.ParseFromString(payload)

    cot = tak_msg.cotEvent
    assert cot.uid == "min-uid"
    assert cot.type == "a-u-G"  # Default value
    assert cot.how == "m-g"  # Default value
    assert cot.lat == 0.0
    assert cot.lon == 0.0
