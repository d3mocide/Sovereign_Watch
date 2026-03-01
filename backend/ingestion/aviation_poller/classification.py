from typing import Dict, Any

# Known Military Operators (User-defined + common variants)
MILITARY_OPERATORS = {
    "United States Air Force", "United States Army", "United States Navy",
    "United States Marine Corps", "US Coast Guard", "Royal Air Force",
    "Royal Canadian Air Force", "Luftwaffe", "USAF", "US Navy", "US Army"
}

# Known Government Operators
GOV_OPERATORS = {
    "US Customs and Border Protection", "FBI", "Department of Homeland Security",
    "NASA", "State Police", "DHS", "CBP", "National Police"
}

def classify_aircraft(ac: Dict[str, Any]) -> Dict[str, Any]:
    """
    Derive a rich classification from raw ADS-B fields.
    Returns a dict with affiliation, platform, size, and raw fields.
    """
    # Extract raw fields safely
    category = (ac.get("category") or "")
    t_field = (ac.get("t") or "")
    db_flags = int(ac.get("dbFlags") or 0)
    operator = (ac.get("ownOp") or "").strip()
    hex_id = (ac.get("hex") or "").upper()
    callsign = (ac.get("flight") or "").strip()

    # 1. Determine Affiliation
    affiliation = "general_aviation"  # Default

    # Logic Priority:
    # 1. dbFlags & 1 -> Military
    if db_flags & 1:
        affiliation = "military"
    # 2. Operator match -> Military
    elif operator in MILITARY_OPERATORS:
        affiliation = "military"
    # 3. Operator match -> Government
    elif operator in GOV_OPERATORS:
        affiliation = "government"
    # 4. Hex range AE0000-AFFFFF -> Military (US)
    elif "AE0000" <= hex_id <= "AFFFFF":
        affiliation = "military"
    # 5. Commercial patterns
    # - Callsign 3-letter ICAO prefix (e.g., AAL123, UAL456)
    # - Category A3 (Large), A4 (Heavy), A5 (High Performance) typically commercial
    elif (len(callsign) > 3 and callsign[:3].isalpha() and callsign[3].isdigit()) or \
         category in ("A3", "A4", "A5"):
        affiliation = "commercial"

    # 2. Determine Platform
    platform = "fixed_wing"  # Default

    # Expanded Drone Classification Logic
    squawk = (ac.get("squawk") or "").strip()
    is_drone = False

    # Check 1: Explicit Category or ICAO type prefix
    if category == "B6" or t_field.startswith(("~", "Q", "UNM")):
        is_drone = True

    # Check 2: Squawk code 7400 (UAS assigned)
    if squawk == "7400":
        is_drone = True

    # Check 3: Operator / Type description string matching
    operator_upper = operator.upper()
    desc_upper = (ac.get("desc") or "").upper()
    drone_keywords = ["DRONE", "UAV", "UAS", "DJI", "SKYDIO", "RQ-", "MQ-", "AEROVIRONMENT", "AUTEL"]
    if any(keyword in operator_upper or keyword in desc_upper for keyword in drone_keywords):
        is_drone = True

    if is_drone:
        platform = "drone"
    elif category == "A7" or t_field.startswith("H"):
        platform = "helicopter"
    elif category == "B2":
        platform = "balloon"
    elif category == "B1":
        platform = "glider"
    elif category == "A6":
        platform = "high_performance"

    # 3. Determine Size (Approximate mapping from Category)
    # A0: No info, A1: Light < 15500lbs, A2: Small < 75000lbs, A3: Large < 300000lbs
    # A4: Heavy > 300000lbs, A5: High Performance, A6: Amphibious, A7: Helicopter
    size = "unknown"
    if category == "A1":
        size = "light"
    elif category == "A2":
        size = "small"
    elif category == "A3":
        size = "large"
    elif category == "A4":
        size = "heavy"
    elif category == "A5":
        size = "high_performance"

    return {
        "affiliation": affiliation,
        "platform": platform,
        "size": size,
        "icaoType": t_field,
        "category": category,
        "dbFlags": db_flags,
        "operator": operator,
        "registration": ac.get("r", ""),
        "description": ac.get("desc", ""),
        "squawk": ac.get("squawk", ""),
        "emergency": ac.get("emergency", "")
    }
