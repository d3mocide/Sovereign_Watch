# Maritime Classification & Visual Intelligence Report
**Sovereign Watch — Vessel Classification, Icon Differentiation & Intelligence Display**

---

## Executive Summary

Sovereign Watch currently treats all vessels as identical generic entities — a single chevron icon, a hardcoded CoT type string `"a-f-S-C-M"`, and no distinction between a 400-meter container ship, a 10-meter pleasure craft, a Coast Guard cutter, or a fishing trawler. The AISStream.io WebSocket delivers rich AIS data, but the maritime poller **only subscribes to `PositionReport` messages** (AIS Type 1/2/3), discarding the `NavigationalStatus` field from those messages and never receiving the classification-critical `ShipStaticData` messages (AIS Type 5) that contain vessel type, dimensions, IMO number, destination, and draught. This report documents how industry marine tracking platforms solve classification, maps all available AIS fields, designs a vessel taxonomy and icon system, and provides implementation plans with agent prompts.

---

## Table of Contents

1. [What Data We Have (And Are Throwing Away)](#1-what-data-we-have-and-are-throwing-away)
2. [The AIS Classification System](#2-the-ais-classification-system)
3. [How the Industry Classifies Vessels](#3-how-the-industry-classifies-vessels)
4. [Proposed Classification Taxonomy](#4-proposed-classification-taxonomy)
5. [Icon & Color System Design](#5-icon--color-system-design)
6. [Pipeline Changes (Backend → Proto → Worker → Frontend)](#6-pipeline-changes)
7. [Information Display Changes (Sidebar, Feed, Search)](#7-information-display-changes)
8. [Filter System Extension](#8-filter-system-extension)
9. [Performance Analysis](#9-performance-analysis)
10. [Compatibility with Aircraft Classification Report](#10-compatibility-with-aircraft-classification-report)
11. [Implementation Plan & Order](#11-implementation-plan--order)
12. [Agent Prompts](#12-agent-prompts)

---

## 1. What Data We Have (And Are Throwing Away)

### Current Subscription: PositionReport Only

The maritime poller (`maritime_poller/main.py`, line 145) subscribes to a single AIS message type:

```python
"FilterMessageTypes": ["PositionReport"]
```

This captures AIS Messages 1, 2, and 3 (Class A position reports). These messages contain:

### Fields Currently Extracted (6 of ~15)

| Field | Source | Used As |
|-------|--------|---------|
| MMSI | `meta["MMSI"]` | `uid` |
| Latitude | `msg["Latitude"]` | Position |
| Longitude | `msg["Longitude"]` | Position |
| COG | `msg["Cog"]` | Course heading |
| SOG | `msg["Sog"]` | Speed (knots→m/s) |
| Ship Name | `meta["ShipName"]` | Callsign |

### Fields Available in PositionReport But Discarded

| Field | Source Key | What It Tells Us |
|-------|-----------|-----------------|
| **Navigation Status** | `msg["NavigationalStatus"]` | Underway, anchored, moored, fishing, aground (0-15) |
| Rate of Turn | `msg["RateOfTurn"]` | Turning rate in degrees/minute |
| True Heading | `msg["TrueHeading"]` | Compass heading (vs COG which is trajectory) |
| Position Accuracy | `msg["PositionAccuracy"]` | High/low accuracy indicator |
| RAIM | `msg["Raim"]` | Receiver integrity monitoring |
| Timestamp | `msg["Timestamp"]` | UTC second of position fix |

### Entire Message Types Never Received

| AIS Type | Message | What It Contains | Why It Matters |
|----------|---------|-----------------|----------------|
| **5** | **ShipStaticData** | **Vessel type (0-99), IMO, callsign, name, dimensions, draught, destination, ETA** | **THE classification message — without this, we cannot distinguish a tanker from a fishing boat** |
| 18 | StandardClassBPositionReport | Class B vessel positions | ~50% of small craft use Class B transponders |
| 19 | ExtendedClassBPositionReport | Class B position + name + ship type + dimensions | Classification for Class B vessels |
| 24 | StaticDataReport | Class B static data (name, type, callsign, dimensions) | Classification for Class B vessels |
| 21 | AidsToNavigationReport | Buoys, lighthouses, fixed structures | AtoN identification |

**Bottom line: We are missing all vessel classification data because we don't subscribe to ShipStaticData (Type 5).**

---

## 2. The AIS Classification System

### 2.1 Ship Type Codes (ITU-R M.1371-5)

AIS uses a 2-digit ship type code (0-99) where the first digit is the general category and the second digit provides cargo hazard specificity.

**First-Digit Categories:**

| Digit | Category | Codes |
|-------|----------|-------|
| 0 | Not available / unknown | 0 |
| 2 | Wing In Ground (WIG) | 20-29 |
| 3 | **Special: Fishing, Towing, Military, Sailing, Pleasure** | 30-39 |
| 4 | High-Speed Craft | 40-49 |
| 5 | **Special: Pilot, SAR, Tug, Law Enforcement, Medical** | 50-59 |
| 6 | **Passenger** | 60-69 |
| 7 | **Cargo** | 70-79 |
| 8 | **Tanker** | 80-89 |
| 9 | Other | 90-99 |

**Complete Reference for Key Codes:**

```
30  Fishing
31  Towing
32  Towing (>200m length or >25m breadth)
33  Dredging or underwater operations
34  Diving operations
35  Military operations
36  Sailing vessel
37  Pleasure craft
50  Pilot vessel
51  Search and Rescue vessel
52  Tug
53  Port tender
54  Anti-pollution equipment
55  Law enforcement
58  Medical transport (Geneva Conventions)
59  Noncombatant ship (RR Resolution No. 18)
60-69  Passenger (60=general, 61-64=hazardous cargo A-D)
70-79  Cargo (70=general, 71-74=hazardous cargo A-D)
80-89  Tanker (80=general, 81-84=hazardous cargo A-D)
90-99  Other type (90=general, 91-94=hazardous cargo A-D)
```

### 2.2 Navigation Status Codes (0-15)

Broadcast in every Position Report (Type 1/2/3). Manually set by the vessel officer.

| Code | Status | Movement State |
|------|--------|---------------|
| 0 | Under way using engine | Moving |
| 1 | At anchor | Stationary |
| 2 | Not under command | Stationary/Drifting |
| 3 | Restricted maneuverability | Variable |
| 4 | Constrained by draught | Moving |
| 5 | Moored | Stationary |
| 6 | Aground | Stationary/Emergency |
| 7 | Engaged in fishing | Moving (special) |
| 8 | Under way sailing | Moving |
| 11 | Towing astern | Moving |
| 12 | Pushing/towing alongside | Moving |
| 14 | AIS-SART / MOB / EPIRB | Emergency |
| 15 | Undefined (default) | Unknown |

### 2.3 MMSI Number Structure

The 9-digit MMSI encodes both the station type and country of registration:

| Pattern | Station Type | Example |
|---------|-------------|---------|
| `MIDxxxxxx` | Ship (MID = first 3 digits) | `366999001` (US) |
| `00MIDxxxx` | Coast station | `003669999` (USCG) |
| `111MIDxxx` | SAR aircraft | `111366001` (US SAR) |
| `970xxxxxx` | AIS-SART | `970012345` |
| `972xxxxxx` | MOB device | `972011234` |
| `98MIDxxxx` | Craft associated with parent | `983660001` |
| `99MIDaxxx` | Aid to Navigation | `993660001` |

**Key MID country codes:** 338/366-369 = USA, 232-233 = UK, 226-228 = France, 211 = Germany, 431 = Japan, 503 = Australia, 370 = Panama, 538 = Marshall Islands, 636 = Liberia.

### 2.4 Class A vs Class B Transponders

| Feature | Class A (Type 1/2/3 + 5) | Class B (Type 18 + 24) |
|---------|-------------------------|------------------------|
| Required for | SOLAS vessels (>300 GT international, >500 GT domestic) | Voluntary (small craft, pleasure) |
| Transmission power | 12.5W | 2W |
| Update rate (moving) | 2-10 seconds | 30-180 seconds |
| Ship Type | Yes (Type 5) | Yes (Type 24B) |
| Navigation Status | Yes | No |
| IMO Number | Yes | No |
| Destination/ETA | Yes | No |
| Draught | Yes | No |
| Dimensions | Yes | Yes |

**Critical implication:** By only subscribing to `PositionReport` (Type 1/2/3), we miss ALL Class B vessels entirely. Class B vessels represent ~50% of vessels in coastal/recreational areas — pleasure craft, sailboats, small fishing boats, RIBs.

---

## 3. How the Industry Classifies Vessels

### 3.1 MarineTraffic Color Coding (Industry Standard)

MarineTraffic's color scheme has become the de facto standard adopted by most marine tracking platforms:

| Color | Hex | Vessel Category | AIS Codes |
|-------|-----|----------------|-----------|
| **Green** | `#2ECC71` | Cargo | 70-79 |
| **Red** | `#E74C3C` | Tanker | 80-89 |
| **Blue** | `#3498DB` | Passenger | 60-69 |
| **Orange** | `#E67E22` | Fishing | 30 |
| **Purple** | `#9B59B6` | Pleasure/Sailing | 36, 37 |
| **Cyan** | `#1ABC9C` | Tug/Pilot/Special | 31, 32, 50-54 |
| **Dark Red** | `#C0392B` | Military | 35 |
| **Navy** | `#2C3E50` | Law Enforcement | 55 |
| **Yellow** | `#F1C40F` | High-Speed Craft | 40-49 |
| **Grey** | `#95A5A6` | Unknown/Other | 0, 90-99 |

### 3.2 Icon Strategy (Moving vs Stationary)

All major platforms use a **two-state icon model**:
- **Moving** (SOG > ~0.5 knots OR navStatus = 0,4,7,8,11,12): **Directional arrow/chevron** rotated to heading/COG. Shape and color determined by vessel type.
- **Stationary** (SOG near 0 OR navStatus = 1,5,6): **Dot/circle**. Color still determined by vessel type. No directional indicator.

Icon rotation priority:
1. True Heading (if available and ≠ 511)
2. COG (if SOG > 0.5 knots)
3. North (0°) — no rotation

### 3.3 Vessel Information Panels

**MarineTraffic quick card:** Vessel name, flag (from MMSI MID), type label, speed/course, destination, last update, photo thumbnail.

**Full detail view:** MMSI, IMO, Call Sign, Flag, Ship Type (name + code), Dimensions (Length × Beam), Draught, Destination, ETA, Navigation Status, Speed, Course, AIS Source, Last Position, Port Call History.

### 3.4 Military/Government Identification

1. **Ship type code 35** = Military operations (most reliable)
2. **Ship type code 55** = Law enforcement
3. **Name heuristics:** `"WARSHIP"`, `"USS "`, `"USCG"`, `"COAST GUARD"`, `"HMS "`
4. **MMSI patterns:** US military often `3669xxxxx`, coast stations `00MIDxxxx`
5. **AIS behavior:** Military vessels frequently operate "dark" (AIS off) or with minimal data

---

## 4. Proposed Classification Taxonomy

### 4.1 Vessel Category Mapping

```typescript
type VesselCategory =
    | 'cargo'           // 70-79: Container ships, bulk carriers, general cargo
    | 'tanker'          // 80-89: Oil, chemical, LNG tankers
    | 'passenger'       // 60-69: Cruise ships, ferries
    | 'fishing'         // 30: Trawlers, seiners, longliners
    | 'pleasure'        // 36-37: Sailboats, yachts, pleasure craft
    | 'tug'             // 31-32, 52: Tugs, towing vessels
    | 'military'        // 35: Naval vessels
    | 'law_enforcement' // 55: Coast Guard, customs, marine police
    | 'sar'             // 51: Search and rescue
    | 'pilot'           // 50: Pilot vessels
    | 'hsc'             // 40-49: High-speed craft, hydrofoils
    | 'special'         // 33-34, 53-54, 56-59: Dredgers, diving ops, medical
    | 'unknown';        // 0, 1-29, 90-99: Unclassified
```

### 4.2 Classification Function (Backend)

```python
VESSEL_CATEGORY_MAP = {
    30: 'fishing',
    31: 'tug', 32: 'tug',
    33: 'special', 34: 'special',
    35: 'military',
    36: 'pleasure', 37: 'pleasure',
    50: 'pilot', 51: 'sar', 52: 'tug',
    53: 'special', 54: 'special',
    55: 'law_enforcement',
    56: 'special', 57: 'special', 58: 'special', 59: 'special',
}

def classify_vessel(ship_type: int, mmsi: int, name: str) -> dict:
    """Derive classification from AIS ship type code, MMSI, and name."""

    # Direct code mapping
    if ship_type in VESSEL_CATEGORY_MAP:
        category = VESSEL_CATEGORY_MAP[ship_type]
    elif 60 <= ship_type <= 69:
        category = 'passenger'
    elif 70 <= ship_type <= 79:
        category = 'cargo'
    elif 80 <= ship_type <= 89:
        category = 'tanker'
    elif 40 <= ship_type <= 49:
        category = 'hsc'
    elif 20 <= ship_type <= 29:
        category = 'hsc'  # WIG treated as HSC
    else:
        category = 'unknown'

    # Hazardous cargo flag (second digit 1-4)
    hazardous = False
    if ship_type > 0:
        second_digit = ship_type % 10
        if 1 <= second_digit <= 4:
            hazardous = True

    # MMSI-based overrides
    mmsi_str = str(mmsi).zfill(9)
    station_type = 'ship'
    if mmsi_str.startswith('00'):
        station_type = 'coast_station'
    elif mmsi_str.startswith('111'):
        station_type = 'sar_aircraft'
    elif mmsi_str.startswith('970'):
        station_type = 'ais_sart'
    elif mmsi_str.startswith('972'):
        station_type = 'mob'
    elif mmsi_str.startswith('99'):
        station_type = 'aton'
    elif mmsi_str.startswith('98'):
        station_type = 'craft_associated'

    # Extract flag country (MID)
    flag_mid = _extract_mid(mmsi_str)

    # Name-based military override
    name_upper = (name or '').upper()
    mil_keywords = ['WARSHIP', 'NAVY', 'USS ', 'USNS ', 'HMS ', 'USCG', 'COAST GUARD']
    if category == 'unknown' and any(kw in name_upper for kw in mil_keywords):
        category = 'military'

    # Size class from ship type range
    size = 'unknown'
    if category in ('cargo', 'tanker', 'passenger') and ship_type % 10 == 0:
        size = 'large'  # General category codes tend to be larger vessels
    elif category == 'pleasure':
        size = 'small'
    elif category == 'fishing':
        size = 'medium'

    return {
        'category': category,
        'shipType': ship_type,
        'hazardous': hazardous,
        'stationType': station_type,
        'flagMid': flag_mid,
        'size': size,
    }
```

### 4.3 CoT Type String Derivation

Replace the hardcoded `"a-f-S-C-M"` with classification-aware types:

```
a-f-S-{affil}-{subtype}

a-f-S-C-M-G    = friendly-Sea-Civilian-Maritime-carGo
a-f-S-C-M-T    = friendly-Sea-Civilian-Maritime-Tanker
a-f-S-C-M-P    = friendly-Sea-Civilian-Maritime-Passenger
a-f-S-C-M-F    = friendly-Sea-Civilian-Maritime-Fishing
a-f-S-M-M      = friendly-Sea-Military-Maritime
a-f-S-C-M      = friendly-Sea-Civilian-Maritime (default/unknown)
```

The frontend can still use `type.includes('S')` for domain detection since all variants contain `S`.

---

## 5. Icon & Color System Design

### 5.1 Vessel Icon Set (8 Distinct Shapes)

| Slot | Name | Shape Description | Used When |
|------|------|-------------------|-----------|
| 0 | `vessel_cargo` | Wide-beam box ship with containers stacked | Cargo (70-79) |
| 1 | `vessel_tanker` | Low-profile rounded hull, centerline pipeline | Tanker (80-89) |
| 2 | `vessel_passenger` | Multi-deck cruise/ferry profile | Passenger (60-69) |
| 3 | `vessel_fishing` | Trawler with boom/net arms | Fishing (30) |
| 4 | `vessel_pleasure` | Small sailboat or yacht profile | Pleasure/Sailing (36-37) |
| 5 | `vessel_tug` | Compact wide-beam tug shape | Tug/Towing (31-32, 52) |
| 6 | `vessel_military` | Warship profile (angular, low, fast) | Military (35) |
| 7 | `vessel_default` | Current generic chevron | Unknown/Other |

### 5.2 Combined Icon Atlas (Aircraft + Maritime)

Expanding the aircraft classification report's atlas to include both domains:

```
768 x 128 pixel canvas (12 columns × 2 rows, 64px cells)

Row 0 (Aircraft):
┌────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│jet_lrg │jet_sml │turbprp │prop_1  │ helo   │mil_jet │mil_trn │ drone  │(free)  │(free)  │(free)  │(free)  │
│(0,0)   │(1,0)   │(2,0)   │(3,0)   │(4,0)   │(5,0)   │(6,0)   │(7,0)   │        │        │        │        │
├────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┤
│v_cargo │v_tankr │v_passg │v_fish  │v_pleas │v_tug   │v_milit │v_deflt │unknown │(free)  │(free)  │(free)  │
│(0,1)   │(1,1)   │(2,1)   │(3,1)   │(4,1)   │(5,1)   │(6,1)   │(7,1)   │(8,1)   │        │        │        │
└────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┘
```

All icons: white fill, `mask: true`, pointing UP for heading rotation. Single 768×128 texture — **one GPU texture bind** for both air and sea, all 17 shapes.

### 5.3 Color Strategy: Type-Based (MarineTraffic Standard)

**Replace the current speed-only gradient for vessels** with a MarineTraffic-standard type-based color scheme. Speed can be communicated via icon opacity or size instead.

```typescript
const VESSEL_COLORS: Record<string, [number, number, number]> = {
    cargo:           [46, 204, 113],   // Green
    tanker:          [231, 76, 60],    // Red
    passenger:       [52, 152, 219],   // Blue
    fishing:         [230, 126, 34],   // Orange
    pleasure:        [155, 89, 182],   // Purple
    tug:             [26, 188, 156],   // Cyan/Teal
    military:        [192, 57, 43],    // Dark Red
    law_enforcement: [44, 62, 80],     // Navy Blue
    sar:             [241, 196, 15],   // Yellow
    pilot:           [22, 160, 133],   // Turquoise
    hsc:             [93, 173, 226],   // Light Blue
    special:         [149, 165, 166],  // Grey
    unknown:         [149, 165, 166],  // Grey
};
```

This creates instant visual differentiation — users can scan the map and immediately see: green = cargo, red = tanker, orange = fishing, purple = pleasure craft.

### 5.4 Moving vs Stationary Icon Selection

```typescript
function getVesselIconName(entity: CoTEntity): string {
    const cls = entity.vesselClassification;
    if (!cls) return 'vessel_default';

    // Stationary vessels get a dot/circle
    const isStationary = cls.navStatus === 1  // Anchored
                      || cls.navStatus === 5  // Moored
                      || cls.navStatus === 6  // Aground
                      || entity.speed < 0.26; // < 0.5 knots

    // For now, use the same shaped icon for both states.
    // Phase 2 can add dot variants.

    const iconMap: Record<string, string> = {
        cargo: 'vessel_cargo',
        tanker: 'vessel_tanker',
        passenger: 'vessel_passenger',
        fishing: 'vessel_fishing',
        pleasure: 'vessel_pleasure',
        tug: 'vessel_tug',
        military: 'vessel_military',
        law_enforcement: 'vessel_military', // reuse military shape with different color
        sar: 'vessel_tug',                  // reuse tug shape with different color
        pilot: 'vessel_tug',
        hsc: 'vessel_passenger',            // reuse passenger with different color
        special: 'vessel_default',
        unknown: 'vessel_default',
    };

    return iconMap[cls.category] || 'vessel_default';
}
```

---

## 6. Pipeline Changes

### 6.1 Backend: Subscribe to Additional AIS Message Types

**File:** `backend/ingestion/maritime_poller/main.py`

The most critical change — subscribe to `ShipStaticData` and Class B messages:

```python
subscription_message = {
    "APIKey": AISSTREAM_API_KEY,
    "BoundingBoxes": [bbox],
    "FilterMessageTypes": [
        "PositionReport",                    # Type 1/2/3 (Class A position)
        "ShipStaticData",                    # Type 5 (vessel type, dims, IMO)
        "StandardClassBPositionReport",      # Type 18 (Class B position)
        "ExtendedClassBPositionReport",      # Type 19 (Class B + name/type)
        "StaticDataReport",                  # Type 24 (Class B static)
    ]
}
```

### 6.2 Backend: Maintain a Vessel Static Data Cache

Since static data (Type 5) arrives every ~6 minutes while position data arrives every 2-10 seconds, the poller needs an in-memory cache to correlate them:

```python
# In-memory cache: MMSI → static data
self.vessel_static_cache: Dict[int, dict] = {}

# When ShipStaticData arrives:
def handle_static_data(self, ais_message: dict):
    msg = ais_message["Message"]["ShipStaticData"]
    mmsi = msg["UserID"]
    self.vessel_static_cache[mmsi] = {
        "shipType": msg.get("Type", 0),
        "imo": msg.get("ImoNumber", 0),
        "callsign": msg.get("CallSign", "").strip(),
        "name": msg.get("Name", "").strip(),
        "dimA": msg.get("Dimension", {}).get("A", 0),
        "dimB": msg.get("Dimension", {}).get("B", 0),
        "dimC": msg.get("Dimension", {}).get("C", 0),
        "dimD": msg.get("Dimension", {}).get("D", 0),
        "draught": msg.get("MaximumStaticDraught", 0),
        "destination": msg.get("Destination", "").strip(),
        "eta": msg.get("Eta", {}),
        "epfd": msg.get("FixType", 0),
        "updated_at": time.time(),
    }

# When PositionReport arrives, merge static data:
def transform_to_tak(self, ais_message: dict) -> dict:
    msg = ais_message["Message"]["PositionReport"]
    meta = ais_message["MetaData"]
    mmsi = meta["MMSI"]

    # Look up cached static data
    static = self.vessel_static_cache.get(mmsi, {})
    ship_type = static.get("shipType", 0)
    classification = classify_vessel(ship_type, mmsi, meta.get("ShipName", ""))

    # ... build TAK message with classification ...
```

### 6.3 Backend: Extend `transform_to_tak()` Output

Add classification and navigation status to the detail object:

```python
"detail": {
    "track": {
        "course": msg.get("Cog", 0),
        "speed": msg.get("Sog", 0) * 0.514444,
        "heading": msg.get("TrueHeading", 511),  # NEW
    },
    "contact": {
        "callsign": static.get("name") or meta.get("ShipName", str(mmsi))
    },
    "vesselClassification": {              # NEW
        "category": classification["category"],
        "shipType": ship_type,
        "navStatus": msg.get("NavigationalStatus", 15),
        "hazardous": classification["hazardous"],
        "stationType": classification["stationType"],
        "flagMid": classification["flagMid"],
        "imo": static.get("imo", 0),
        "callsign": static.get("callsign", ""),
        "registration": "",                # AIS uses callsign, not registration
        "destination": static.get("destination", ""),
        "draught": static.get("draught", 0),
        "length": static.get("dimA", 0) + static.get("dimB", 0),
        "beam": static.get("dimC", 0) + static.get("dimD", 0),
    }
}
```

### 6.4 Protobuf: Add VesselClassification Message

**Files:** `backend/api/proto/tak.proto` AND `frontend/public/tak.proto`

```protobuf
message VesselClassification {
    string category = 1;       // cargo|tanker|passenger|fishing|...
    uint32 ship_type = 2;      // AIS ship type code (0-99)
    uint32 nav_status = 3;     // Navigation status (0-15)
    bool hazardous = 4;        // Carrying dangerous cargo
    string station_type = 5;   // ship|coast_station|sar_aircraft|aton|...
    uint32 flag_mid = 6;       // Maritime Identification Digit (country)
    uint32 imo = 7;            // IMO number
    string callsign = 8;       // Radio callsign
    string destination = 9;    // Reported destination
    float draught = 10;        // Current draught (meters)
    float length = 11;         // Overall length (A+B, meters)
    float beam = 12;           // Overall beam (C+D, meters)
}

message Detail {
    Contact contact = 1;
    Track track = 2;
    Group group = 3;
    Status status = 4;
    PrecisionLocation precisionLocation = 5;
    Classification classification = 6;            // Aircraft (from prior report)
    VesselClassification vesselClassification = 7; // NEW: Maritime
    string xmlDetail = 100;
}
```

### 6.5 Frontend Type: Add VesselClassification

**File:** `frontend/src/types.ts`

```typescript
export interface VesselClassification {
    category?: string;       // cargo|tanker|passenger|fishing|...
    shipType?: number;       // AIS ship type code (0-99)
    navStatus?: number;      // Navigation status (0-15)
    hazardous?: boolean;     // Carrying dangerous cargo
    stationType?: string;    // ship|coast_station|sar_aircraft|...
    flagMid?: number;        // Country MID
    imo?: number;            // IMO number
    callsign?: string;       // Radio callsign
    destination?: string;    // Reported destination
    draught?: number;        // meters
    length?: number;         // meters
    beam?: number;           // meters
}

export type CoTEntity = {
    // ... existing fields ...
    classification?: EntityClassification;          // Aircraft
    vesselClassification?: VesselClassification;    // NEW: Maritime
};
```

---

## 7. Information Display Changes

### 7.1 SidebarRight — Vessel-Specific Detail Panel

When a vessel is selected, show maritime-specific information:

```
┌─────────────────────────────────────┐
│ 🚢 IDENTIFIED_TARGET                │
│ EVER GIVEN                  [✕]     │
│                                     │
│ ┌──────────┐ ┌────────────────────┐ │
│ │ CARGO    │ │ IMO: 9811000       │ │
│ │ TYPE_TAG │ │ MMSI: 353136000    │ │
│ └──────────┘ └────────────────────┘ │
│                                     │
│ ┌───────────────────────────────┐   │
│ │ Container Ship               │   │  ← Ship type description
│ │ Flag: Panama (370)           │   │  ← Flag from MID
│ │ Callsign: 9VBC5             │   │  ← Radio callsign
│ │ Dimensions: 400m × 59m      │   │  ← Length × Beam
│ │ Draught: 16.0m              │   │  ← Current draught
│ └───────────────────────────────┘   │
│                                     │
│ [CENTER_VIEW]  [TRACK_LOG]          │
├─────────────────────────────────────┤
│ Positional_Telemetry                │
│ LAT: 29.945200°  LON: 32.354800°   │
│                                     │
│ Vector_Dynamics                     │
│ SOG: 12.3 kts    COG: 165°         │
│ HDG: 168°        ROT: +2.1°/min    │  ← True heading + ROT
│ NAV: Under way using engine         │  ← Navigation status
│ DEST: ROTTERDAM  ETA: 03/15 14:00  │  ← Destination + ETA
│                                     │
│ 🧭 [Compass Widget]                │
│                                     │
│ Hazardous Cargo: Category B    ⚠️   │  ← If hazardous flag
├─────────────────────────────────────┤
│ Metadata_Source                     │
│ TIME_TRACKED: 4.2s                  │
│ Signal_Source: AIS_STREAM           │
│ Classification: CARGO               │
│ Transponder: CLASS_A                │
└─────────────────────────────────────┘
```

### 7.2 IntelFeed — Vessel-Type-Aware Events

```
NEW  🚢 [CARGO] EVER GIVEN — Container Ship, 400m
NEW  ⛽ [TANKER] NISSOS RHENIA — Crude Oil Tanker
NEW  🎣 [FISH] LINDA M — Fishing Vessel
NEW  ⚓ [MIL] USS NIMITZ — Military Operations
ALERT ⚠️ CHEMICAL CARRIER — Hazardous Cargo Cat A
LOST 🚢 MAERSK SEALAND — Left coverage area
```

### 7.3 SearchWidget — Vessel Type and Dimensions

```
┌─────────────────────────────────────┐
│ 🔍 EVER                             │
├─────────────────────────────────────┤
│ 🟢 EVER GIVEN              LIVE    │  ← Green = cargo
│    Cargo · 400m · Panama · 3s ago   │
├─────────────────────────────────────┤
│ 🔴 EVER GRACE              LIVE    │  ← Red = tanker
│    Tanker · 333m · 12s ago          │
├─────────────────────────────────────┤
│ ⚫ EVER STRONG              HIST    │
│    Unknown · 2h ago                 │
└─────────────────────────────────────┘
```

### 7.4 Navigation Status Label Function

```typescript
const NAV_STATUS_LABELS: Record<number, string> = {
    0: 'Under way using engine',
    1: 'At anchor',
    2: 'Not under command',
    3: 'Restricted maneuverability',
    4: 'Constrained by draught',
    5: 'Moored',
    6: 'Aground',
    7: 'Engaged in fishing',
    8: 'Under way sailing',
    11: 'Towing astern',
    12: 'Pushing/towing alongside',
    14: 'AIS-SART active',
    15: 'Not defined',
};

const SHIP_TYPE_LABELS: Record<number, string> = {
    0: 'Not available',
    30: 'Fishing vessel', 31: 'Towing vessel', 32: 'Towing (large)',
    33: 'Dredger', 34: 'Diving operations', 35: 'Military operations',
    36: 'Sailing vessel', 37: 'Pleasure craft',
    50: 'Pilot vessel', 51: 'SAR vessel', 52: 'Tug',
    53: 'Port tender', 54: 'Anti-pollution', 55: 'Law enforcement',
    58: 'Medical transport', 59: 'Noncombatant',
    60: 'Passenger ship', 70: 'Cargo ship', 80: 'Tanker', 90: 'Other',
};
```

---

## 8. Filter System Extension

### 8.1 Maritime Sub-Filters

Extend the filter system (coordinated with the aircraft classification report) to include vessel type sub-filters:

```typescript
const [filters, setFilters] = useState({
    // Domain toggles (existing)
    showAir: true,
    showSea: true,
    // Air sub-filters (from aircraft report)
    showHelicopter: true,
    showMilitary: true,
    showGovernment: true,
    // Sea sub-filters (NEW)
    showCargo: true,
    showTanker: true,
    showPassenger: true,
    showFishing: true,
    showPleasure: true,
    showSeaMilitary: true,   // Maritime military/law enforcement
});
```

### 8.2 Filter UI

```
┌─────────────────────────────────────┐
│ ⚡ Active Collection Filters         │
├─────────────────────────────────────┤
│ ✈ AIR  ●━━━━━━━●                   │
│   🚁 HELO    ●━━━━●                │
│   🔶 MIL     ●━━━━●                │
│                                      │
│ 🚢 SEA  ●━━━━━━━●                   │
│   📦 CARGO   ●━━━━●                │
│   ⛽ TANKER  ●━━━━●                │
│   🚢 PASSGR  ●━━━━●                │
│   🎣 FISH    ●━━━━●                │
│   ⛵ PLEAS   ●━━━━●                │
│   ⚓ MIL     ●━━━━●                │
└─────────────────────────────────────┘
```

---

## 9. Performance Analysis

### 9.1 Backend Impact

| Change | Cost | Notes |
|--------|------|-------|
| Subscribe to ShipStaticData (Type 5) | Low | ~1 message per vessel per 6 minutes. For 200 vessels: ~33 extra msgs/min |
| Subscribe to Class B (Type 18/24) | Medium | Adds ~30-50% more vessels in coastal areas. More WebSocket messages |
| Vessel static cache | Low | ~500 bytes per vessel × 1000 vessels = ~500KB |
| `classify_vessel()` per message | Negligible | Integer comparisons and string lookups, ~5μs |
| Larger Kafka messages | Low | ~150 bytes additional per message |

### 9.2 Frontend Impact

| Change | Cost | Notes |
|--------|------|-------|
| Combined icon atlas (768×128) | None at runtime | Single texture, same as current 128×64 but larger. One GPU bind. |
| `getVesselIconName()` per entity per frame | Negligible | Single object property lookup + map access |
| Type-based coloring | None | Replaces speed-based color with type-based. Same code path. |
| VesselClassification data per entity | Low | ~200 bytes per entity |
| Additional filter checks | Negligible | 2-3 extra boolean checks per vessel per frame |

### 9.3 Message Volume Estimate

For a typical 150nm coastal coverage area with ~200 vessels:

| Message Type | Rate | Monthly Volume |
|-------------|------|----------------|
| PositionReport (current) | ~500/min | ~21.6M messages |
| ShipStaticData (new) | ~33/min | ~1.4M messages |
| Class B Position (new) | ~200/min | ~8.6M messages |
| **Total** | **~733/min** | **~31.6M messages** |

This is a ~47% increase in WebSocket messages from AISStream.io. The Kafka throughput is well within RedPanda's capabilities (~100K+ messages/sec).

---

## 10. Compatibility with Aircraft Classification Report

Both reports share the same architectural approach and are designed to combine cleanly:

| Component | Aircraft Report | Maritime Report | Combined |
|-----------|----------------|-----------------|----------|
| Proto `Detail` message | `Classification classification = 6` | `VesselClassification vesselClassification = 7` | Both fields coexist, tagged differently |
| `CoTEntity` type | `classification?: EntityClassification` | `vesselClassification?: VesselClassification` | Both optional fields, domain-exclusive |
| Icon atlas | Row 0: 8 aircraft shapes | Row 1: 8 vessel shapes + unknown | Single 768×128 canvas, 17 shapes |
| Color strategy | Altitude gradient (aircraft) | Type-based MarineTraffic colors (vessels) | Domain-switched in `getColor` |
| Filter system | `showHelicopter`, `showMilitary`, `showGovernment` | `showCargo`, `showTanker`, `showFishing`, etc. | All coexist under domain master toggles |
| `getIconName()` | Checks `!type.includes('S')` | Checks `type.includes('S')` | Combined function with domain branch |

**Implementation order:** Aircraft report prompts first (1-6), then maritime report prompts (1-5). The icon atlas prompt should be combined into a single implementation that generates both rows.

---

## 11. Implementation Plan & Order

### Phase 1: Backend — AIS Message Subscription & Static Cache
1. Add ShipStaticData, Class B message types to subscription
2. Implement message type router (PositionReport vs ShipStaticData vs ClassB)
3. Add vessel static data in-memory cache
4. Add `classify_vessel()` function
5. Extend `transform_to_tak()` to include classification + navStatus

### Phase 2: Proto & Types
6. Add `VesselClassification` message to both proto files
7. Add `VesselClassification` interface to `types.ts`

### Phase 3: Frontend Data Thread
8. Extract vesselClassification in `processEntityUpdate()`
9. Thread through to interpolated entities

### Phase 4: Icons & Colors
10. Add 8 vessel shapes to the combined icon atlas
11. Add `getVesselIconName()` function
12. Implement type-based color scheme for vessels
13. Update IconLayer getIcon and getColor callbacks

### Phase 5: Information Display
14. Extend SidebarRight with vessel-specific sections
15. Enrich IntelFeed with vessel type tags
16. Add vessel type/dimensions to SearchWidget results

### Phase 6: Filters
17. Add maritime sub-filter state
18. Extend LayerFilters with vessel type toggles
19. Apply sub-filters in animation loop

---

## 12. Agent Prompts

### Prompt 1 — Backend: Extend AIS Subscription and Add Static Data Cache

```
TASK: Extend the maritime poller to subscribe to additional AIS message types
and maintain a vessel static data cache for classification.

FILE: backend/ingestion/maritime_poller/main.py

CONTEXT: The poller currently only subscribes to "PositionReport" (AIS Type
1/2/3), which provides position and speed but NO vessel type, dimensions,
IMO number, or destination. To classify vessels, we need "ShipStaticData"
(Type 5) which arrives every ~6 minutes per vessel.

CHANGES:

A) Update the subscription message (around line 145) to include:
   "FilterMessageTypes": [
       "PositionReport",
       "ShipStaticData",
       "StandardClassBPositionReport",
       "StaticDataReport"
   ]

B) Add a vessel static data cache as an instance variable:
   self.vessel_static_cache: Dict[int, dict] = {}

C) Add a handle_static_data() method that processes ShipStaticData messages:
   - Extract: Type (ship type 0-99), ImoNumber, CallSign, Name,
     Dimension (A,B,C,D), MaximumStaticDraught, Destination, Eta, FixType
   - Store in vessel_static_cache keyed on MMSI (UserID)
   - Log at debug level: "Static data cached for MMSI {mmsi}: {name} type={type}"

D) Add a handle_class_b_position() method for StandardClassBPositionReport:
   - Extract same kinematic fields as PositionReport (Sog, Cog, Lat, Lon)
   - Note: Class B messages do NOT have NavigationalStatus or RateOfTurn
   - Build TAK message same as PositionReport but with navStatus=15 (undefined)

E) Update the stream_loop message handler to route by MessageType:
   - "PositionReport" → existing transform_to_tak() (enhanced)
   - "ShipStaticData" → handle_static_data() (cache only, no Kafka publish)
   - "StandardClassBPositionReport" → handle_class_b_position()
   - "StaticDataReport" → handle_static_data() variant for Type 24

F) Add a classify_vessel() function (module-level or method) that takes
   ship_type (int), mmsi (int), and name (str) and returns:
   {
     "category": "cargo"|"tanker"|"passenger"|"fishing"|"pleasure"|"tug"|
                 "military"|"law_enforcement"|"sar"|"pilot"|"hsc"|"special"|"unknown",
     "shipType": int,
     "hazardous": bool,     # second digit 1-4
     "stationType": str,    # from MMSI pattern
     "flagMid": int,        # country MID from MMSI
   }

   Category mapping:
   30=fishing, 31-32=tug, 35=military, 36-37=pleasure, 50=pilot,
   51=sar, 52=tug, 55=law_enforcement, 58=special, 59=special,
   60-69=passenger, 70-79=cargo, 80-89=tanker, 40-49=hsc, 0/90-99=unknown

G) Extend transform_to_tak() to:
   1. Look up vessel_static_cache for the MMSI
   2. Call classify_vessel() with the cached ship type
   3. Extract NavigationalStatus from msg (default 15 if missing)
   4. Add "vesselClassification" dict to detail:
      {
        "category": classification["category"],
        "shipType": ship_type,
        "navStatus": nav_status,
        "hazardous": classification["hazardous"],
        "stationType": classification["stationType"],
        "flagMid": classification["flagMid"],
        "imo": static.get("imo", 0),
        "callsign": static.get("callsign", ""),
        "destination": static.get("destination", ""),
        "draught": static.get("draught", 0),
        "length": dim_a + dim_b,
        "beam": dim_c + dim_d,
      }
   5. Also add TrueHeading to detail.track:
      "heading": msg.get("TrueHeading", 511)

H) Add periodic cache cleanup — evict entries older than 30 minutes to
   prevent memory growth from transient vessels.

VERIFY: Run the poller and check Kafka output. Vessels should now have
vesselClassification in their detail. ShipStaticData messages should be
cached (check logs). Class B vessels should appear that were previously
invisible.
```

### Prompt 2 — Protobuf: Add VesselClassification Message

```
TASK: Add a VesselClassification message to the TAK protobuf schema.

FILES:
- backend/api/proto/tak.proto
- frontend/public/tak.proto
(Both files MUST be identical)

CHANGES:

A) Add a new VesselClassification message:

   message VesselClassification {
     string category = 1;
     uint32 ship_type = 2;
     uint32 nav_status = 3;
     bool hazardous = 4;
     string station_type = 5;
     uint32 flag_mid = 6;
     uint32 imo = 7;
     string callsign = 8;
     string destination = 9;
     float draught = 10;
     float length = 11;
     float beam = 12;
   }

B) Add the VesselClassification field to the Detail message:
   message Detail {
     Contact contact = 1;
     Track track = 2;
     Group group = 3;
     Status status = 4;
     PrecisionLocation precisionLocation = 5;
     Classification classification = 6;
     VesselClassification vesselClassification = 7;  // NEW
     string xmlDetail = 100;
   }

C) BOTH proto files must be byte-identical.

NOTE: If the Aircraft Classification report's Prompt 2 has already been
applied (adding Classification at field 6), just add VesselClassification
at field 7. If not, add both Classification (field 6) and
VesselClassification (field 7) in one pass.

VERIFY: Protobuf compiler parses without errors. The TAK worker will
automatically decode the new fields.
```

### Prompt 3 — Frontend: Add Vessel Types & Thread Data

```
TASK: Add VesselClassification type and thread vessel classification data
from proto decode through to CoTEntity storage.

FILES:
- frontend/src/types.ts
- frontend/src/components/map/TacticalMap.tsx

CHANGES:

A) In types.ts, add VesselClassification interface:
   export interface VesselClassification {
       category?: string;
       shipType?: number;
       navStatus?: number;
       hazardous?: boolean;
       stationType?: string;
       flagMid?: number;
       imo?: number;
       callsign?: string;
       destination?: string;
       draught?: number;
       length?: number;
       beam?: number;
   }

   Add to CoTEntity:
   vesselClassification?: VesselClassification;

B) In TacticalMap.tsx processEntityUpdate(), after extracting existing
   fields, extract vessel classification from the decoded proto detail:

   const vesselClassification = entity.detail?.vesselClassification as
       VesselClassification | undefined;

   Include in entitiesRef.current.set():
   vesselClassification: vesselClassification || existingEntity?.vesselClassification,

   Use || existingEntity?.vesselClassification to preserve classification
   across position updates that may not include static data.

C) Thread vesselClassification through to interpolatedEntity in the
   animation loop.

VERIFY: Select a vessel in the UI and confirm entity.vesselClassification
contains data in the browser console.
```

### Prompt 4 — Icons & Colors: Vessel Type Visual Differentiation

```
TASK: Add vessel-type-specific icon shapes and MarineTraffic-standard
color coding to the map.

FILE: frontend/src/components/map/TacticalMap.tsx

CONTEXT: This prompt should be combined with Aircraft Classification
Report Prompt 4 (icon atlas) if both are being implemented. If the
aircraft atlas already exists, extend it.

CHANGES:

A) In createIconAtlas(), add 8 vessel icon shapes to Row 1 of the canvas.
   Each is a 64x64 cell, drawn as white canvas paths, pointing UP:

   1. vessel_cargo (0,1): Wide rectangular hull with stacked container blocks
   2. vessel_tanker (1,1): Rounded low-profile hull with centerline pipe
   3. vessel_passenger (2,1): Multi-tiered superstructure, cruise/ferry profile
   4. vessel_fishing (3,1): Small hull with boom/mast extending from center
   5. vessel_pleasure (4,1): Small sailboat profile with triangular sail
   6. vessel_tug (5,1): Compact, wide-beam square-ish profile
   7. vessel_military (6,1): Angular low-profile warship, swept bow
   8. vessel_default (7,1): Current generic chevron

   If the aircraft icons are in Row 0, expand canvas height to 128px.

B) Add getVesselIconName() function:
   function getVesselIconName(entity: CoTEntity): string {
       const cls = entity.vesselClassification;
       if (!cls) return 'vessel_default';
       const map: Record<string, string> = {
           cargo: 'vessel_cargo', tanker: 'vessel_tanker',
           passenger: 'vessel_passenger', fishing: 'vessel_fishing',
           pleasure: 'vessel_pleasure', tug: 'vessel_tug',
           military: 'vessel_military', law_enforcement: 'vessel_military',
           sar: 'vessel_tug', pilot: 'vessel_tug',
           hsc: 'vessel_passenger', special: 'vessel_default',
           unknown: 'vessel_default',
       };
       return map[cls.category] || 'vessel_default';
   }

C) Update getIconName() (or the combined icon selector) to route:
   if (entity.type?.includes('S')) return getVesselIconName(entity);
   // ... aircraft logic ...

D) Add MarineTraffic-standard type-based coloring for vessels.
   In the getColor callback, for sea entities:

   const VESSEL_COLORS: Record<string, [number,number,number]> = {
       cargo: [46, 204, 113],       // Green
       tanker: [231, 76, 60],       // Red
       passenger: [52, 152, 219],   // Blue
       fishing: [230, 126, 34],     // Orange
       pleasure: [155, 89, 182],    // Purple
       tug: [26, 188, 156],         // Cyan
       military: [192, 57, 43],     // Dark Red
       law_enforcement: [44, 62, 80], // Navy
       sar: [241, 196, 15],         // Yellow
       pilot: [22, 160, 133],       // Turquoise
       hsc: [93, 173, 226],         // Light Blue
       special: [149, 165, 166],    // Grey
       unknown: [149, 165, 166],    // Grey
   };

   function vesselTypeColor(entity: CoTEntity, alpha: number): [number,number,number,number] {
       const cat = entity.vesselClassification?.category || 'unknown';
       const [r, g, b] = VESSEL_COLORS[cat] || VESSEL_COLORS.unknown;
       return [r, g, b, alpha];
   }

   Replace the existing speedToColor() call for vessels with vesselTypeColor().

CONSTRAINTS:
- All icons white fill, mask: true (colors applied by getColor)
- Icons must be recognizable at 24-32px
- Each icon points UP — rotation handled by getAngle
- Single canvas atlas — no external images

VERIFY: Cargo ships should appear as green box-ship icons, tankers as
red rounded hulls, fishing boats as orange trawlers, etc.
```

### Prompt 5 — Sidebar & Feed: Display Vessel Intelligence

```
TASK: Extend SidebarRight, IntelFeed, and SearchWidget to display vessel
classification data including type, dimensions, destination, and nav status.

FILES:
- frontend/src/components/layouts/SidebarRight.tsx
- frontend/src/components/widgets/IntelFeed.tsx
- frontend/src/components/widgets/SearchWidget.tsx
- frontend/src/components/map/TacticalMap.tsx (event generation)

CHANGES:

A) SidebarRight.tsx — When entity is a vessel (type.includes('S')) AND
   vesselClassification exists, add a vessel-specific info section:

   In the header area:
   - Show vessel category as a colored badge (cargo=green, tanker=red, etc.)
   - Show IMO number (if > 0)
   - Show flag country (derive from flagMid using a MID→country lookup)
   - Show dimensions: "{length}m × {beam}m" (if > 0)

   In Vector_Dynamics section, replace aircraft-specific fields with:
   - SOG: speed in knots (entity.speed * 1.94384)
   - COG: entity.course
   - NAV STATUS: label from navStatus code (use a lookup table)
   - DESTINATION: vesselClassification.destination (if not empty)
   - DRAUGHT: vesselClassification.draught (if > 0)
   - HAZARDOUS: warning badge if vesselClassification.hazardous is true

   Remove altitude display for vessels (always 0).

   Add a lookup table for nav status labels:
   { 0: 'Under way using engine', 1: 'At anchor', 2: 'Not under command',
     3: 'Restricted maneuverability', 4: 'Constrained by draught',
     5: 'Moored', 6: 'Aground', 7: 'Engaged in fishing',
     8: 'Under way sailing', 14: 'AIS-SART active', 15: 'Not defined' }

   Add a lookup table for ship type code → human readable label:
   { 30: 'Fishing vessel', 35: 'Military operations', 37: 'Pleasure craft',
     52: 'Tug', 55: 'Law enforcement', 60: 'Passenger ship',
     70: 'Cargo ship', 80: 'Tanker', ... }

B) IntelFeed — In TacticalMap.tsx where vessel events are generated
   (new entity and lost entity events):
   - Add vessel type emoji: 🚢=cargo, ⛽=tanker, 🎣=fishing, ⛵=pleasure,
     ⚓=military, 🚢=passenger
   - Add tags: [CARGO], [TANKER], [FISH], [MIL], [LAW] as appropriate
   - Add dimensions if available: " — 400m"
   - Include category in the event classification field

C) SearchWidget — In the results list, for vessel entities add:
   - Vessel category badge (colored dot matching MarineTraffic scheme)
   - Ship type label (e.g., "Cargo Ship")
   - Dimensions if available (e.g., "400m × 59m")
   - Flag country if MID is known

VERIFY:
1. Select a cargo vessel — sidebar shows green CARGO badge, dimensions,
   destination, nav status
2. New vessel event shows type emoji and tag in intel feed
3. Search results show vessel type and dimensions
```

---

## Appendix A — AIS Ship Type Quick Reference

```
30 = Fishing          35 = Military         36 = Sailing
37 = Pleasure craft   50 = Pilot vessel     51 = SAR vessel
52 = Tug              55 = Law enforcement  58 = Medical

60-69 = Passenger     70-79 = Cargo         80-89 = Tanker

Second digit 1-4 = Hazardous cargo categories A-D
```

## Appendix B — Navigation Status Quick Reference

```
0 = Under way (engine)    1 = At anchor       2 = Not under command
3 = Restricted maneuver   4 = Constrained     5 = Moored
6 = Aground               7 = Fishing         8 = Under way (sail)
11 = Towing astern        12 = Pushing/towing  14 = AIS-SART/MOB
15 = Undefined
```

## Appendix C — MarineTraffic Color Palette (Hex Values)

```
Cargo:      #2ECC71 (green)       Tanker:    #E74C3C (red)
Passenger:  #3498DB (blue)        Fishing:   #E67E22 (orange)
Pleasure:   #9B59B6 (purple)      Tug:       #1ABC9C (cyan)
Military:   #C0392B (dark red)    Law Enf:   #2C3E50 (navy)
SAR:        #F1C40F (yellow)      HSC:       #5DADE2 (light blue)
Unknown:    #95A5A6 (grey)
```

## Appendix D — MMSI Country Extraction

```
MMSI 366999001 → MID=366 → USA
MMSI 232004000 → MID=232 → United Kingdom
MMSI 370000001 → MID=370 → Panama
MMSI 538006288 → MID=538 → Marshall Islands
MMSI 636018756 → MID=636 → Liberia
```

---

*Report generated from analysis of Sovereign Watch v0.5.0 and industry marine tracking research*
*Affected files: `backend/ingestion/maritime_poller/main.py`, `backend/api/proto/tak.proto`, `frontend/public/tak.proto`, `frontend/src/types.ts`, `frontend/src/components/map/TacticalMap.tsx`, `frontend/src/components/layouts/SidebarRight.tsx`, `frontend/src/components/widgets/IntelFeed.tsx`, `frontend/src/components/widgets/SearchWidget.tsx`, `frontend/src/components/widgets/LayerFilters.tsx`, `frontend/src/App.tsx`*
*Analysis date: 2026-02-17*
