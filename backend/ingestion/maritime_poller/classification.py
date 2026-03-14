from typing import Dict, Any

def classify_vessel(ship_type: int, mmsi: int, name: str) -> Dict[str, Any]:
    category = "unknown"
    hazardous = False
    name_upper = name.upper() if name else ""

    # 1. Primary classification by AIS Ship Type
    if ship_type == 30:
        category = "fishing"
    elif ship_type in (31, 32, 52):
        category = "tug"
    elif ship_type == 33:
        category = "dredging"
    elif ship_type == 34:
        category = "diving"
    elif ship_type == 35:
        category = "military"
    elif ship_type in (36, 37) or 170 <= ship_type <= 179:
        category = "pleasure"
    elif 40 <= ship_type <= 49:
        category = "hsc"
    elif ship_type == 50:
        category = "pilot"
    elif ship_type == 51:
        category = "sar"
    elif ship_type == 53:
        category = "port_tender"
    elif ship_type == 54:
        category = "anti_pollution"
    elif ship_type == 55:
        category = "law_enforcement"
    elif ship_type in (58, 59):
        category = "special"
    elif 60 <= ship_type <= 69:
        category = "passenger"
    elif 70 <= ship_type <= 79:
        category = "cargo"
    elif 80 <= ship_type <= 89:
        category = "tanker"
    elif ship_type == 90:
        category = "other"

    # 2. Heuristics fallback for "unknown" or "other" types.
    # Order matters: more specific / higher-precision patterns must come first
    # so that unambiguous signals (e.g. "TRAWLER") beat broader keywords
    # (e.g. "QUEEN") that appear later in a multi-word vessel name.
    if category in ("unknown", "other", "special"):
        # Tug / Towing (very specific prefixes)
        if any(x in name_upper for x in ["TUG", "TOW", "PUSH", "FOSS", "VALIANT", "TITAN"]):
            category = "tug"
        # Military (distinctive designators)
        elif any(x in name_upper for x in ["USS ", "USNS", "CGC", "WARSHIP", "NAVY", "RFA"]):
            category = "military"
        # Fishing (specific vessel designators checked before broad passenger terms)
        elif any(x in name_upper for x in ["FISHING", "TRAWLER", "FV ", "F/V", "CRABBER"]):
            category = "fishing"
        # Search and Rescue
        elif any(x in name_upper for x in ["RESCUE", "LIFEBOAT", "SAR"]):
            category = "sar"
        # Pilot
        elif any(x in name_upper for x in ["PILOT", "PLT"]):
            category = "pilot"
        # Passenger / Ferries
        elif any(x in name_upper for x in ["FERRY", "WSF", "SPIRIT", "PASSENGER", "QUEEN", "BREEZE"]):
            category = "passenger"
        # Yachts / Pleasure
        elif any(x in name_upper for x in ["YACHT", "MY ", "M/Y", "SY ", "S/V", "SV "]):
            category = "pleasure"
        # Law Enforcement
        elif any(x in name_upper for x in ["POLICE", "SHERIFF", "PATROL"]):
            category = "law_enforcement"

    if 1 <= (ship_type % 10) <= 4 and category in ("cargo", "tanker", "passenger", "hsc"):
        hazardous = True

    mmsi_str = str(mmsi)
    flag_mid = 0
    station_type = "ship"

    if len(mmsi_str) == 9:
        if mmsi_str.startswith("00"):
            station_type = "coastal"
            flag_mid = int(mmsi_str[2:5])
        elif mmsi_str.startswith("0"):
            station_type = "group"
            flag_mid = int(mmsi_str[1:4])
        elif mmsi_str.startswith("111"):
            station_type = "sar_aircraft"
            flag_mid = int(mmsi_str[3:6])
        elif mmsi_str.startswith("8"):
            station_type = "handheld"
            flag_mid = int(mmsi_str[1:4])
        elif mmsi_str.startswith("98"):
            station_type = "craft_associated"
            flag_mid = int(mmsi_str[2:5])
        elif mmsi_str.startswith("99"):
            station_type = "navaid"
            flag_mid = int(mmsi_str[2:5])
        else:
            station_type = "ship"
            flag_mid = int(mmsi_str[0:3])

    return {
        "category": category,
        "shipType": ship_type,
        "hazardous": hazardous,
        "stationType": station_type,
        "flagMid": flag_mid
    }
