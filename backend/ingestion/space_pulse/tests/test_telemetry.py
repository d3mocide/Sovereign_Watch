"""Orbital wire format preserves typed fields without duplicating JSON."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'api'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from proto.tak_pb2 import TakMessage
from telemetry import encode_orbital_event


def test_orbital_wire_roundtrip():
    event = {
        'uid': 'SAT-25544', 'type': 'a-s-K', 'how': 'm-g', 'time': 1700000000000,
        'point': {'lat': 0, 'lon': 0, 'hae': 420000, 'ce': 1000, 'le': 1000},
        'detail': {'track': {'course': 0, 'speed': 7600},
                   'contact': {'callsign': 'ISS'}, 'category': 'station',
                   'constellation': None, 'period_min': 92,
                   'inclination_deg': 51.6, 'eccentricity': 0},
    }
    wire = encode_orbital_event(event)
    assert wire[:3] == b'\xbf\x01\xbf'
    message = TakMessage()
    message.ParseFromString(wire[3:])
    cot = message.cotEvent
    assert cot.uid == 'SAT-25544'
    assert cot.lat == cot.lon == 0
    assert cot.detail.period_min == 92
    assert cot.detail.contact.callsign == 'ISS'
    assert cot.stale - cot.time == 60000
    assert cot.raw == ''
    assert len(wire) < 200
