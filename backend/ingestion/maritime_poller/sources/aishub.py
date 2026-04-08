"""
AISHub WebSocket source adapter.

AISHub (data.aishub.net) is a free globally-aggregated AIS network of volunteer
receivers.  A free account (username only, no paid key) gives access to a real-time
WebSocket feed.

Enable by setting the env var AISHUB_USERNAME.  When the variable is absent the source
is skipped and the poller behaves exactly as before (AISStream only).

Message normalisation
---------------------
AISHub delivers JSON arrays where each element describes one vessel.  This module
converts those elements into AISStream-compatible dicts so that the existing
transform_to_tak / handle_class_b_position / handle_static_data logic in service.py
requires zero changes.

AISHub field notes
------------------
- SOG  : tenths of knots  (85  → 8.5 kn)
- COG  : tenths of degrees (1800 → 180.0°)
- HEADING: integer degrees, 511 = not available (same sentinel as AIS standard)
- TIME  : "YYYY-MM-DD HH:MM:SS GMT" string — not used in TAK transform, safe to ignore
"""

import asyncio
import json
import logging
from typing import Optional

import websockets
import websockets.exceptions

from utils import calculate_bboxes

logger = logging.getLogger(__name__)

AISHUB_WS_URL = "wss://data.aishub.net/ws.php"

# AISHub delivers all position + static fields in a single message type.
# We synthesise one PositionReport and one ShipStaticData dict per vessel so
# the existing service.py parsing paths handle them without modification.
_POSITION_REPORT_TYPE = "PositionReport"
_STATIC_DATA_TYPE = "ShipStaticData"


def _build_bbox_params(center_lat: float, center_lon: float, radius_nm: int) -> str:
    """Return AISHub bbox query-string fragment from a mission bounding box."""
    boxes = calculate_bboxes(center_lat, center_lon, radius_nm)
    # AISHub accepts a single bounding box.  When the area wraps the antimeridian we
    # use the first box (main coverage); the second wrap box is a best-effort bonus.
    box = boxes[0]
    latmin, lonmin = box[0]
    latmax, lonmax = box[1]
    return f"latmin={latmin:.4f}&latmax={latmax:.4f}&lngmin={lonmin:.4f}&lngmax={lonmax:.4f}"


def build_ws_url(username: str, center_lat: float, center_lon: float, radius_nm: int) -> str:
    bbox = _build_bbox_params(center_lat, center_lon, radius_nm)
    return f"{AISHUB_WS_URL}?username={username}&format=1&{bbox}"


async def connect(
    username: str,
    center_lat: float,
    center_lon: float,
    radius_nm: int,
) -> Optional[websockets.WebSocketClientProtocol]:
    """Open an AISHub WebSocket connection.  Returns the socket or None on failure."""
    url = build_ws_url(username, center_lat, center_lon, radius_nm)
    logger.info("🌊 Connecting to AISHub: %s", url)
    try:
        ws = await websockets.connect(
            url,
            open_timeout=30,
            ping_interval=30,
            ping_timeout=20,
        )
        logger.info("✅ AISHub connection established")
        return ws
    except asyncio.TimeoutError:
        logger.error("❌ AISHub connection timed out")
        return None
    except Exception as exc:
        logger.error("❌ Failed to connect to AISHub: %s", exc)
        return None


def parse_messages(raw_json: str) -> list[dict]:
    """
    Parse one AISHub WebSocket frame and return a list of AISStream-compatible dicts.

    Each vessel entry produces:
    - Always: one PositionReport dict  (latitude/longitude/sog/cog/heading/navstat)
    - When static fields are present: one ShipStaticData dict (name/type/imo/callsign/…)

    Returns an empty list if the frame cannot be parsed or contains no vessels.
    """
    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError:
        logger.debug("AISHub: non-JSON frame ignored: %r", raw_json[:120])
        return []

    # AISHub sends either a JSON array of vessels or a status object like {"ERROR":...}
    if not isinstance(payload, list):
        if isinstance(payload, dict) and payload.get("ERROR"):
            logger.warning("AISHub error frame: %s", payload["ERROR"])
        return []

    results: list[dict] = []
    for vessel in payload:
        if not isinstance(vessel, dict):
            continue
        mmsi = vessel.get("MMSI")
        if not mmsi:
            continue

        lat = vessel.get("LATITUDE")
        lon = vessel.get("LONGITUDE")
        if lat is None or lon is None:
            continue

        # SOG and COG are in tenths of the respective unit in raw AIS, but AISHub
        # already converts them to floats (knots and degrees) in format=1.
        sog = float(vessel.get("SOG", 0.0))
        cog = float(vessel.get("COG", 0.0))
        heading = int(vessel.get("HEADING", 511))
        nav_status = int(vessel.get("NAVSTAT", 15))
        ship_name = str(vessel.get("NAME", "")).strip()

        # ── PositionReport ────────────────────────────────────────────────────
        results.append(
            {
                "MessageType": _POSITION_REPORT_TYPE,
                "MetaData": {
                    "MMSI": mmsi,
                    "ShipName": ship_name,
                },
                "Message": {
                    "PositionReport": {
                        "Latitude": float(lat),
                        "Longitude": float(lon),
                        "Sog": sog,
                        "Cog": cog,
                        "TrueHeading": heading,
                        "NavigationalStatus": nav_status,
                    }
                },
            }
        )

        # ── ShipStaticData (only when at least one static field is present) ──
        ship_type = vessel.get("TYPE")
        imo = vessel.get("IMO")
        callsign = str(vessel.get("CALLSIGN", "")).strip()
        destination = str(vessel.get("DEST", "")).strip()
        draught = vessel.get("DRAUGHT")
        dim_a = int(vessel.get("A", 0))
        dim_b = int(vessel.get("B", 0))
        dim_c = int(vessel.get("C", 0))
        dim_d = int(vessel.get("D", 0))

        has_static = any([ship_name, ship_type, imo, callsign, destination])
        if has_static:
            static_msg: dict = {}
            if ship_name:
                static_msg["Name"] = ship_name
            if ship_type is not None:
                static_msg["Type"] = int(ship_type)
            if imo is not None:
                static_msg["ImoNumber"] = int(imo)
            if callsign:
                static_msg["CallSign"] = callsign
            if destination:
                static_msg["Destination"] = destination
            if draught is not None:
                static_msg["MaximumStaticDraught"] = float(draught)
            static_msg["Dimension"] = {
                "A": dim_a,
                "B": dim_b,
                "C": dim_c,
                "D": dim_d,
            }

            results.append(
                {
                    "MessageType": _STATIC_DATA_TYPE,
                    "MetaData": {"MMSI": mmsi, "ShipName": ship_name},
                    "Message": {"ShipStaticData": static_msg},
                }
            )

    return results
