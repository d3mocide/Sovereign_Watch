from typing import Dict, Any

# Known Military Operators (User-defined + common variants)
MILITARY_OPERATORS = {
    "United States Air Force", "United States Army", "United States Navy",
    "United States Marine Corps", "US Coast Guard", "Royal Air Force",
    "Royal Canadian Air Force", "Luftwaffe", "USAF", "US Navy", "US Army"
}

# Known Government Operators (High Confidence)
GOV_OPERATORS = {
    "US Customs and Border Protection", "FBI", "Department of Homeland Security",
    "NASA", "State Police", "DHS", "CBP", "National Police", "Justice Department",
    "United States Marshals Service", "USMS", "Drug Enforcement Administration", "DEA"
}

# Law Enforcement and Government Keywords (Substring Match)
LAW_ENFORCEMENT_KEYWORDS = [
    "POLICE", "SHERIFF", "STATE TROOPER", "LAW ENFORCEMENT", "DEPT OF JUSTICE",
    "HIGHWAY PATROL", "CONSTABLE", "CITY OF", "COUNTY OF"
]

# Drone specific string matchers
MILITARY_UAS_STRINGS = [
    "USAF RQ-", "RQ-4", "MQ-9", "MQ-1", "RQ-170", "RQ-180",
    "GLOBAL HAWK", "REAPER", "PREDATOR"
]
COMMERCIAL_UAS_STRINGS = [
    "SKYDIO", "WINGCOPTER", "ZIPLINE", "WINGTRA"
]
CIVIL_UAS_STRINGS = [
    "MAVIC", "PHANTOM", "DJI"
]
UAS_MANUFACTURER_STRINGS = [
    "GENERAL ATOMICS", "NORTHROP GRUMMAN"
]
GENERIC_UAS_STRINGS = [
    "DRONE", "UAV", "UAS", "RPV", "RPAS", "UNMANNED", "UNM"
]

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
    desc = (ac.get("desc") or "").strip()
    squawk = (ac.get("squawk") or "").strip()
    registration = (ac.get("r") or "").strip()

    # 1. Determine Affiliation
    affiliation = "general_aviation"  # Default

    # Logic Priority:
    # 1. dbFlags & 1 -> Military
    if db_flags & 1:
        affiliation = "military"
    # 2. Operator match -> Military
    elif operator in MILITARY_OPERATORS:
        affiliation = "military"
    # 3. Operator match (Exact) -> Government
    elif operator in GOV_OPERATORS:
        affiliation = "government"
    # 4. Operator/Callsign match (Substring) -> Government
    elif any(kw in operator.upper() for kw in LAW_ENFORCEMENT_KEYWORDS) or \
         any(kw in callsign.upper() for kw in LAW_ENFORCEMENT_KEYWORDS):
        affiliation = "government"
    # 5. Hex range AE0000-AFFFFF -> Military (US)
    elif "AE0000" <= hex_id <= "AFFFFF":
        affiliation = "military"
    # 6. Commercial patterns
    # - Callsign 3-letter ICAO prefix (e.g., AAL123, UAL456)
    # - Category A3 (Large), A4 (Heavy), A5 (High Performance) typically commercial
    elif (len(callsign) > 3 and callsign[:3].isalpha() and callsign[3].isdigit()) or \
         category in ("A3", "A4", "A5"):
        affiliation = "commercial"

    # 2. Determine Platform
    platform = "fixed_wing"  # Default

    # Build search string for string matching logic
    search_str = f"{operator} {callsign} {desc} {registration}".upper()

    # Determine if it is a drone
    is_drone = False

    if category == "B6":
        is_drone = True
    elif squawk == "7400":
        is_drone = True
    elif t_field.startswith("~"):
        is_drone = True
    elif t_field.startswith("Q") and not t_field == "Q400": # Exclude common non-drone Q code
        is_drone = True
    elif any(s in search_str for s in GENERIC_UAS_STRINGS):
        is_drone = True
    elif any(s in search_str for s in MILITARY_UAS_STRINGS):
        is_drone = True
    elif any(s in search_str for s in COMMERCIAL_UAS_STRINGS):
        is_drone = True
    elif any(s in search_str for s in CIVIL_UAS_STRINGS):
        is_drone = True
    elif any(s in search_str for s in UAS_MANUFACTURER_STRINGS):
        is_drone = True
    elif t_field == "GRND" and (any(s in search_str for s in GENERIC_UAS_STRINGS) or
                                any(s in search_str for s in COMMERCIAL_UAS_STRINGS) or
                                any(s in search_str for s in CIVIL_UAS_STRINGS)):
        is_drone = True
    elif t_field.endswith("Q"): # e.g. wake turbulence category or other specific trailing Q
        # Double check if it's likely a drone, some regular planes might have trailing Q.
        # But per instructions, check for trailing Q in wake turbulence or UNM in desc
        # The prompt says "check for trailing Q in wake turbulence category or UNM (Unmanned) in category descriptions"
        # The category is usually just B6, A1. The type is t_field. If t_field ends with Q and is short it might be drone
        # Let's consider UNM was handled above. If t_field ends with Q, it might be a drone wake category.
        # We will map any t_field ending in Q to drone if not standard.
        # For safety and as requested:
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

    result = {
        "affiliation": affiliation,
        "platform": platform,
        "size": size,
        "icaoType": t_field,
        "category": category,
        "dbFlags": db_flags,
        "operator": operator,
        "registration": registration,
        "description": desc,
        "squawk": squawk,
        "emergency": ac.get("emergency", "")
    }

    if platform == "drone":
        result["aircraft_class"] = "drone"
        drone_class = "UNKNOWN_UAS"

        if squawk == "7400":
            drone_class = "MILITARY_UAS"
        elif any(s in search_str for s in MILITARY_UAS_STRINGS):
            drone_class = "MILITARY_UAS"
        elif affiliation == "military":
            drone_class = "MILITARY_UAS"
        elif any(s in search_str for s in UAS_MANUFACTURER_STRINGS):
            drone_class = "MILITARY_UAS"
        elif any(s in search_str for s in COMMERCIAL_UAS_STRINGS):
            drone_class = "COMMERCIAL_UAS"
        elif any(s in search_str for s in CIVIL_UAS_STRINGS):
            drone_class = "CIVIL_UAS"
        elif affiliation == "commercial":
            drone_class = "COMMERCIAL_UAS"

        result["drone_class"] = drone_class

    return result
