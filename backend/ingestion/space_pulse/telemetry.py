"""Orbital telemetry encoded once with the shared TAK Protocol V1 schema."""
from proto.tak_pb2 import TakMessage

TAK_MAGIC = b"\xbf\x01\xbf"


def encode_orbital_event(event: dict) -> bytes:
    message = TakMessage()
    cot = message.cotEvent
    cot.uid, cot.type, cot.how = event["uid"], event["type"], event["how"]
    cot.time = cot.start = event["time"]
    cot.stale = cot.time + 60_000
    point, detail = event["point"], event["detail"]
    cot.lat, cot.lon, cot.hae = point["lat"], point["lon"], point["hae"]
    cot.ce, cot.le = point["ce"], point["le"]
    cot.detail.track.course = detail["track"]["course"]
    cot.detail.track.speed = detail["track"]["speed"]
    cot.detail.contact.callsign = detail["contact"]["callsign"]
    cot.detail.category = detail.get("category") or ""
    cot.detail.constellation = detail.get("constellation") or ""
    cot.detail.period_min = detail.get("period_min") or 0
    cot.detail.inclination_deg = detail.get("inclination_deg") or 0
    cot.detail.eccentricity = detail.get("eccentricity") or 0
    cot.detail.classification.category = cot.detail.category
    cot.detail.classification.constellation = cot.detail.constellation
    return TAK_MAGIC + message.SerializeToString()
