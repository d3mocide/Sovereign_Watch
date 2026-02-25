import logging
from datetime import datetime
from proto.tak_pb2 import TakMessage

logger = logging.getLogger("SovereignWatch.TAK")

def to_epoch(val):
    if val is None:
        return 0
    if isinstance(val, (int, float)):
        return int(val)
    if isinstance(val, str):
        try:
            # Simple ISO check (Python 3.11+)
            dt = datetime.fromisoformat(val.replace('Z', '+00:00'))
            return int(dt.timestamp() * 1000)
        except ValueError:
            pass
    return 0

def to_float(val, default=0.0):
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

def transform_to_proto(data: dict) -> bytes:
    """
    Transforms a normalized JSON track object into a TAK Protocol Buffer message.
    Returns the serialized bytes prefixed with the TAK magic header (0xbf 0x01 0xbf).
    """
    tak_msg = TakMessage()
    cot = tak_msg.cotEvent

    # 1. Root Fields
    cot.uid = str(data.get("uid", "unknown"))
    cot.type = str(data.get("type", "a-u-G"))
    cot.start = to_epoch(data.get("start"))
    cot.stale = to_epoch(data.get("stale"))
    cot.time = to_epoch(data.get("time"))
    cot.how = str(data.get("how", "m-g"))

    # 2. Point Data
    point = data.get("point", {})
    cot.lat = to_float(point.get("lat"))
    cot.lon = to_float(point.get("lon"))
    cot.hae = to_float(point.get("hae"))
    cot.ce = to_float(point.get("ce"), 9999.0)
    cot.le = to_float(point.get("le"), 9999.0)

    # 3. Details
    src_detail = data.get("detail", {})

    # Track
    src_track = src_detail.get("track", {})
    cot.detail.track.course = to_float(src_track.get("course"))
    cot.detail.track.speed = to_float(src_track.get("speed"))
    cot.detail.track.vspeed = to_float(src_track.get("vspeed"))

    # Contact
    src_contact = src_detail.get("contact", {})
    cot.detail.contact.callsign = str(src_contact.get("callsign", cot.uid))

    # Classification
    src_class = src_detail.get("classification", {})
    if src_class:
        cls = cot.detail.classification
        cls.affiliation = str(src_class.get("affiliation", ""))
        cls.platform = str(src_class.get("platform", ""))
        cls.size_class = str(src_class.get("size", "")) # size in JSON, size_class in Proto
        cls.icao_type = str(src_class.get("icaoType", ""))
        cls.category = str(src_class.get("category", ""))
        cls.db_flags = int(src_class.get("dbFlags") or 0)
        cls.operator = str(src_class.get("operator", ""))
        cls.registration = str(src_class.get("registration", ""))
        cls.description = str(src_class.get("description", ""))
        cls.squawk = str(src_class.get("squawk", ""))
        cls.emergency = str(src_class.get("emergency", ""))

    # Vessel Classification
    src_vessel = src_detail.get("vesselClassification", {})
    if src_vessel:
        vc = cot.detail.vesselClassification
        vc.category = str(src_vessel.get("category", ""))
        vc.ship_type = int(src_vessel.get("shipType", 0))
        vc.nav_status = int(src_vessel.get("navStatus", 15))
        vc.hazardous = bool(src_vessel.get("hazardous", False))
        vc.station_type = str(src_vessel.get("stationType", ""))
        vc.flag_mid = int(src_vessel.get("flagMid", 0))
        vc.imo = int(src_vessel.get("imo", 0))
        vc.callsign = str(src_vessel.get("callsign", ""))
        vc.destination = str(src_vessel.get("destination", ""))
        vc.draught = to_float(src_vessel.get("draught"))
        vc.length = to_float(src_vessel.get("length"))
        vc.beam = to_float(src_vessel.get("beam"))

    # Serialize
    payload = tak_msg.SerializeToString()

    # Magic Bytes (0xbf 0x01 0xbf)
    magic = bytes([0xbf, 0x01, 0xbf])

    return magic + payload
