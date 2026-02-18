# Aircraft Classification & Visual Intelligence Report
**Sovereign Watch — Entity Classification, Icon Differentiation & Intelligence Display**

---

## Executive Summary

Sovereign Watch currently treats all aircraft as identical generic entities — a single chevron icon, a hardcoded CoT type string `"a-f-A-C-F"`, and no distinction between a Cessna 172, a Boeing 737, a Black Hawk helicopter, or an F-16 fighter. The raw ADS-B data arriving from adsb.fi, adsb.lol, and airplanes.live contains rich classification fields (`category`, `t`, `dbFlags`, `ownOp`, `r`, `squawk`, `emergency`) that are **discarded at the normalization layer** and never reach the frontend.

This report documents how industry flight tracking platforms solve this problem, maps the exact data fields available from our polled sources, designs a classification taxonomy, proposes a multi-shape icon atlas, and provides implementation plans with agent prompts to thread classification data from backend to render layer.

---

## Table of Contents

1. [What Data We Have (And Are Throwing Away)](#1-what-data-we-have-and-are-throwing-away)
2. [How the Industry Classifies Aircraft](#2-how-the-industry-classifies-aircraft)
3. [Proposed Classification Taxonomy](#3-proposed-classification-taxonomy)
4. [Icon Atlas Design](#4-icon-atlas-design)
5. [Pipeline Changes (Backend → Proto → Worker → Frontend)](#5-pipeline-changes)
6. [Information Display Changes (Sidebar, Feed, Search)](#6-information-display-changes)
7. [Filter System Extension](#7-filter-system-extension)
8. [Performance Analysis](#8-performance-analysis)
9. [Implementation Plan & Order](#9-implementation-plan--order)
10. [Agent Prompts](#10-agent-prompts)

---

## 1. What Data We Have (And Are Throwing Away)

The APIs we poll (adsb.fi v3, adsb.lol v2, airplanes.live v2) all return the **readsb JSON format**. Each aircraft object contains ~40 fields. Our `normalize_to_tak()` function (line 301 of `main.py`) extracts **7 fields** and discards the rest.

### Fields Currently Extracted

| Field | Source Key | Used As |
|-------|-----------|---------|
| ICAO hex | `hex` | `uid` |
| Latitude | `lat` | Position |
| Longitude | `lon` | Position |
| Altitude | `alt_baro`/`alt_geom` | HAE (feet→meters) |
| Ground speed | `gs` | Speed (knots→m/s) |
| Track | `track` | Course heading |
| Callsign | `flight` | Display name |

### Classification Fields Currently Discarded

| Field | Source Key | What It Tells Us | Example |
|-------|-----------|-----------------|---------|
| **ICAO type designator** | `t` | Exact aircraft model | `"B738"`, `"H60"`, `"C172"` |
| **Emitter category** | `category` | Weight class, helicopter flag | `"A3"` (large), `"A7"` (rotorcraft) |
| **Database flags** | `dbFlags` | Military, interesting, PIA, LADD | `1` = military |
| **Operator** | `ownOp` | Who operates this aircraft | `"United Airlines"`, `"US Air Force"` |
| **Registration** | `r` | Tail number | `"N12345"`, `"09-5904"` |
| **Description** | `desc` | Full aircraft type name | `"BOEING 737-800"` |
| **Squawk** | `squawk` | Transponder code | `"7700"` (emergency) |
| **Emergency** | `emergency` | Emergency status | `"none"`, `"general"`, `"lifeguard"` |
| **Baro rate** | `baro_rate` | Climb/descent rate | `+1200` fpm (climbing) |
| **Nav modes** | `nav_modes` | Autopilot state | `["autopilot","lnav","vnav"]` |

**All of these fields are free — they arrive in every API response. We just need to stop throwing them away.**

---

## 2. How the Industry Classifies Aircraft

### 2.1 ADS-B Emitter Category (DO-260B Standard)

The `category` field is broadcast by the aircraft's own transponder. It follows RTCA DO-260B:

**Set A — Aircraft by Weight:**
| Code | Class | Weight | Examples |
|------|-------|--------|----------|
| `A0` | No info | — | Unconfigured transponders |
| `A1` | Light | <15,500 lbs | Cessna 172, Piper Cherokee |
| `A2` | Small | 15,500–75,000 lbs | Citation, Learjet, Embraer 145 |
| `A3` | Large | 75,000–300,000 lbs | 737, A320, 757 |
| `A4` | High Vortex Large | ~300,000 lbs | 757 specifically (wake hazard) |
| `A5` | Heavy | >300,000 lbs | 747, A380, C-5 Galaxy |
| `A6` | High Performance | >5g, >400kts | Fighter jets (F-16, F-22, Typhoon) |
| `A7` | **Rotorcraft** | Any | All helicopters |

**Set B — Non-Fixed-Wing:**
| Code | Class |
|------|-------|
| `B1` | Glider/Sailplane |
| `B2` | Lighter-than-air (balloon, blimp) |
| `B4` | Ultralight/Hang glider |
| `B6` | UAV/Drone |

**Set C — Surface:**
| Code | Class |
|------|-------|
| `C1` | Emergency vehicle |
| `C2` | Service vehicle |

### 2.2 ICAO Type Designator (Doc 8643)

The `t` field contains a 2–4 character type code from the ICAO type database. Each type has a **3-character type description** encoding:

| Position | Meaning | Values |
|----------|---------|--------|
| Char 1 | Aircraft class | `L`=Landplane, `H`=Helicopter, `G`=Gyrocopter, `T`=Tiltrotor, `S`=Seaplane, `A`=Amphibian |
| Char 2 | Engine count | `1`, `2`, `3`, `4`, `6`, `8`, `C`=coupled |
| Char 3 | Engine type | `J`=Jet, `T`=Turboprop/shaft, `P`=Piston, `E`=Electric |

**Examples:**
- `B738` → `L2J` = Landplane, 2 engines, Jet (Boeing 737-800)
- `H60` → `H2T` = Helicopter, 2 engines, Turboshaft (UH-60 Black Hawk)
- `C172` → `L1P` = Landplane, 1 engine, Piston (Cessna 172)
- `V22` → `T2T` = Tiltrotor, 2 engines, Turboshaft (V-22 Osprey)

### 2.3 Military Identification (4 Methods)

| Method | Field | How | Reliability |
|--------|-------|-----|-------------|
| Database flag | `dbFlags & 1` | Community-maintained hex→military mapping | Very high |
| Operator match | `ownOp` | String match against known military operators | High |
| Hex range | `hex` | Country-specific military ICAO address sub-ranges | Medium |
| Squawk codes | `squawk` | Military-specific transponder codes (7777, 4400-4477) | Low (situational) |

**US Military hex range:** `AE0000`–`AFFFFF` (civil range ends at `ADF7C7`)

**`dbFlags` bitmask:**
```
Bit 0 (1):  Military
Bit 1 (2):  Interesting (noteworthy aircraft)
Bit 2 (4):  PIA (Privacy ICAO Address — obfuscated)
Bit 3 (8):  LADD (Limiting Aircraft Data Displayed)
```

### 2.4 How Major Platforms Display This

**FlightRadar24:** 12 filter categories (Passenger, Cargo, Military/Government, Business Jet, GA, Helicopter, Lighter-than-air, Glider, Drone, Ground Vehicle, Other, Uncategorized). ~30–50 distinct icon silhouettes. Color = data source (yellow=terrestrial ADS-B, blue=satellite, orange=FAA delayed).

**ADS-B Exchange / tar1090:** 150+ unique aircraft silhouettes mapped from type designator (specific icons for B737, A320, F-16, Black Hawk, C-130, etc.). Color = altitude gradient. Supports type-description-based filtering (`H..` for all helicopters).

**FlightAware:** Type-specific silhouettes. Altitude-based coloring. Hollow icons for low-confidence positions.

**Common pattern across all platforms:**
1. Primary icon shape from ICAO type designator (`t`)
2. Fallback to emitter category (`category`) for generic shape
3. Enrichment from database lookup (`dbFlags`, `ownOp`, `r`)
4. Color independent of icon shape (altitude, speed, or data source)

---

## 3. Proposed Classification Taxonomy

### 3.1 Entity Classification Hierarchy

```
Domain
├── AIR
│   ├── Affiliation
│   │   ├── MILITARY (dbFlags & 1, or ownOp match, or hex range)
│   │   ├── GOVERNMENT (ownOp match: CBP, Coast Guard, FBI, NASA, etc.)
│   │   └── CIVILIAN
│   │       ├── COMMERCIAL (airline callsign prefix or category A3-A5)
│   │       └── GENERAL_AVIATION (everything else)
│   │
│   ├── Platform
│   │   ├── FIXED_WING (category A1-A6, or type desc L..)
│   │   ├── HELICOPTER (category A7, or type desc H..)
│   │   ├── TILTROTOR (type desc T..)
│   │   ├── DRONE (category B6)
│   │   ├── BALLOON (category B2)
│   │   ├── GLIDER (category B1)
│   │   └── UNKNOWN
│   │
│   └── Size
│       ├── LIGHT (A1, WTC L)
│       ├── SMALL (A2)
│       ├── LARGE (A3-A4, WTC M)
│       ├── HEAVY (A5, WTC H/J)
│       └── HIGH_PERF (A6)
│
└── SEA
    ├── Affiliation
    │   ├── MILITARY (AIS type 35, 55)
    │   ├── LAW_ENFORCEMENT (AIS type 55)
    │   └── CIVILIAN
    │
    └── Vessel Type (from AIS type code, future)
        ├── CARGO (70-79)
        ├── TANKER (80-89)
        ├── PASSENGER (60-69)
        ├── FISHING (30)
        ├── TUG (52)
        └── OTHER
```

### 3.2 Classification Function (Backend)

```python
def classify_aircraft(ac: dict) -> dict:
    """Derive classification from raw ADS-B fields."""
    category = ac.get("category", "")
    db_flags = ac.get("dbFlags", 0)
    ownOp = ac.get("ownOp", "")
    hex_code = ac.get("hex", "")
    t = ac.get("t", "")
    squawk = ac.get("squawk", "")
    flight = (ac.get("flight") or "").strip()

    # --- Affiliation ---
    affiliation = "civilian"
    if db_flags & 1:
        affiliation = "military"
    elif _is_military_operator(ownOp):
        affiliation = "military"
    elif _is_gov_operator(ownOp):
        affiliation = "government"
    elif _is_military_hex(hex_code):
        affiliation = "military"
    elif affiliation == "civilian":
        if _is_airline_callsign(flight) or category in ("A3","A4","A5"):
            affiliation = "commercial"
        else:
            affiliation = "general_aviation"

    # --- Platform ---
    platform = "fixed_wing"
    if category == "A7" or (len(t) >= 1 and t[0] == 'H'):
        platform = "helicopter"
    elif category == "B6":
        platform = "drone"
    elif category == "B2":
        platform = "balloon"
    elif category == "B1":
        platform = "glider"
    elif category == "A6":
        platform = "high_performance"
    # Tiltrotor check requires type DB lookup (V22 → T2T)

    # --- Size ---
    size = "unknown"
    if category == "A1": size = "light"
    elif category == "A2": size = "small"
    elif category in ("A3", "A4"): size = "large"
    elif category == "A5": size = "heavy"
    elif category == "A6": size = "high_performance"

    # --- Emergency ---
    emergency = ac.get("emergency", "none")
    if squawk in ("7700", "7600", "7500"):
        emergency = {"7700": "general", "7600": "nordo", "7500": "hijack"}.get(squawk, emergency)

    return {
        "affiliation": affiliation,
        "platform": platform,
        "size": size,
        "icaoType": t,
        "category": category,
        "dbFlags": db_flags,
        "operator": ownOp,
        "registration": ac.get("r", ""),
        "description": ac.get("desc", ""),
        "squawk": squawk,
        "emergency": emergency,
    }
```

### 3.3 CoT Type String Derivation

Replace the hardcoded `"a-f-A-C-F"` with a proper CoT type:

```
a-{affil}-{domain}-{mil/civ}-{platform}

Examples:
  a-f-A-M-H  = friendly-Air-Military-Helicopter (Black Hawk)
  a-f-A-C-F  = friendly-Air-Civilian-Fixed-wing (737)
  a-f-A-M-F  = friendly-Air-Military-Fixed-wing (C-130)
  a-f-A-C-H  = friendly-Air-Civilian-Helicopter (news helo)
  a-f-S-C-M  = friendly-Sea-Civilian-Maritime (container ship)
```

---

## 4. Icon Atlas Design

### 4.1 Current State

The existing `createIconAtlas()` generates a 128x64 canvas with 2 identical chevron shapes. Both aircraft and vessels use the same silhouette.

### 4.2 Proposed Icon Set (Phase 1: 10 Distinct Shapes)

| Slot | Name | Shape Description | Used When |
|------|------|-------------------|-----------|
| 0 | `jet_large` | Swept-wing airliner silhouette (widebody proportions) | A3-A5 or L.J commercial |
| 1 | `jet_small` | Narrow business jet silhouette | A2 or small L.J |
| 2 | `turboprop` | Straight wing with visible prop discs | L.T types |
| 3 | `prop_single` | Small high-wing single-engine | A1, L1P, GA aircraft |
| 4 | `helicopter` | Rotor disc + fuselage (side profile) | A7, H.. types |
| 5 | `military_fast` | Delta/swept fighter silhouette | A6, military jets |
| 6 | `military_transport` | High-wing with 4 props (C-130 style) | Military L.T/L4J cargo |
| 7 | `drone` | Small fixed-wing with no cockpit | B6 category |
| 8 | `vessel` | Ship hull with superstructure | Sea domain |
| 9 | `unknown` | Current chevron (fallback) | Unclassified |

### 4.3 Canvas Atlas Layout

```
512 x 128 pixel canvas (8 columns × 2 rows, 64px cells)

┌────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│jet_lrg │jet_sml │turbprp │prop_1  │ helo   │mil_jet │mil_trn │ drone  │
│(0,0)   │(1,0)   │(2,0)   │(3,0)   │(4,0)   │(5,0)   │(6,0)   │(7,0)   │
├────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┤
│vessel  │unknown │ (free) │ (free) │ (free) │ (free) │ (free) │ (free) │
│(0,1)   │(1,1)   │        │        │        │        │        │        │
└────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┘
```

All icons drawn in white with `mask: true` — colored dynamically by the existing altitude/speed gradient. Military entities additionally get a distinct color treatment (see Section 6).

### 4.4 Icon Selection Function (Frontend)

```typescript
function getIconName(entity: CoTEntity): string {
    const cls = entity.classification;
    if (!cls) return entity.type?.includes('S') ? 'vessel' : 'unknown';

    // Sea domain
    if (entity.type?.includes('S')) return 'vessel';

    // Helicopter
    if (cls.platform === 'helicopter') return 'helicopter';

    // Drone
    if (cls.platform === 'drone') return 'drone';

    // Military
    if (cls.affiliation === 'military') {
        if (cls.platform === 'high_performance' || cls.category === 'A6') return 'military_fast';
        if (cls.size === 'heavy' || cls.size === 'large') return 'military_transport';
        return 'military_fast'; // default military
    }

    // Civilian fixed-wing by size
    if (cls.size === 'heavy' || cls.size === 'large') return 'jet_large';
    if (cls.size === 'small') return 'jet_small';
    if (cls.size === 'light') return 'prop_single';

    // Fallback by category
    if (cls.category?.startsWith('A') && parseInt(cls.category[1]) >= 3) return 'jet_large';
    if (cls.category === 'A2') return 'jet_small';
    if (cls.category === 'A1') return 'prop_single';

    return 'unknown';
}
```

### 4.5 Color Strategy — Layered Classification

Keep the existing altitude/speed gradient as the PRIMARY color, but add a secondary visual treatment for affiliation:

| Affiliation | Primary Color | Border/Outline Treatment | Glow Color |
|-------------|---------------|-------------------------|------------|
| Commercial | Altitude gradient (green→red) | None | Standard pulse |
| General Aviation | Altitude gradient (green→red) | None | Standard pulse |
| Military | Altitude gradient | **Gold/amber outline ring** | Amber pulse |
| Government | Altitude gradient | **White outline ring** | White pulse |
| Emergency | **Red override** | **Red flashing ring** | Red rapid pulse |

This preserves your existing altitude color system while making military/government entities immediately distinguishable.

---

## 5. Pipeline Changes

### 5.1 Backend: Extend `normalize_to_tak()`

**File:** `backend/ingestion/poller/main.py`

Thread the classification fields through the existing `detail` object:

```python
"detail": {
    "track": { "course": ..., "speed": ... },
    "contact": { "callsign": ... },
    # NEW: Classification data
    "classification": {
        "affiliation": "military",      # military|government|commercial|general_aviation
        "platform": "helicopter",       # fixed_wing|helicopter|drone|balloon|glider|high_performance
        "size": "large",                # light|small|large|heavy|high_performance|unknown
        "icaoType": "H60",             # ICAO type designator
        "category": "A7",              # ADS-B emitter category
        "dbFlags": 1,                  # Bitmask (1=mil, 2=interesting, 4=PIA, 8=LADD)
        "operator": "United States Army",
        "registration": "09-5904",
        "description": "SIKORSKY UH-60 BLACKHAWK",
        "squawk": "1200",
        "emergency": "none"
    }
}
```

Also derive a proper CoT type string instead of the hardcoded value:

```python
"type": "a-f-A-M-H"  # Derived from classification
```

### 5.2 Protobuf: Extend Detail Message

**Files:** `backend/api/proto/tak.proto` AND `frontend/public/tak.proto` (must match)

Add a `Classification` message to the proto schema:

```protobuf
message Detail {
  Contact contact = 1;
  Track track = 2;
  Group group = 3;
  Status status = 4;
  PrecisionLocation precisionLocation = 5;
  Classification classification = 6;  // NEW
  string xmlDetail = 100;
}

// NEW MESSAGE
message Classification {
  string affiliation = 1;     // military|government|commercial|general_aviation
  string platform = 2;        // fixed_wing|helicopter|drone|balloon|glider|...
  string size_class = 3;      // light|small|large|heavy|high_performance|unknown
  string icao_type = 4;       // "B738", "H60", etc.
  string category = 5;        // ADS-B emitter category "A3", "A7", etc.
  uint32 db_flags = 6;        // dbFlags bitmask
  string operator = 7;        // "United Airlines", "US Air Force", etc.
  string registration = 8;    // "N12345", "09-5904", etc.
  string description = 9;     // "BOEING 737-800", etc.
  string squawk = 10;         // Transponder code
  string emergency = 11;      // "none", "general", "lifeguard", etc.
}
```

### 5.3 TAK Worker: Automatic

The TAK worker (`tak.worker.ts`) uses `protobufjs` with `takType.toObject()` which automatically deserializes all proto fields. **No worker changes needed** — the new `Classification` message will appear in `cotEvent.detail.classification` automatically once the proto is updated.

### 5.4 Frontend Type: Extend CoTEntity

**File:** `frontend/src/types.ts`

```typescript
export interface EntityClassification {
    affiliation?: string;   // military|government|commercial|general_aviation
    platform?: string;      // fixed_wing|helicopter|drone|balloon|glider|...
    sizeClass?: string;     // light|small|large|heavy|high_performance|unknown
    icaoType?: string;      // "B738", "H60"
    category?: string;      // "A3", "A7"
    dbFlags?: number;       // bitmask
    operator?: string;      // "United Airlines"
    registration?: string;  // "N12345"
    description?: string;   // "BOEING 737-800"
    squawk?: string;        // "1200"
    emergency?: string;     // "none"
}

export type CoTEntity = {
    // ... existing fields ...
    classification?: EntityClassification;  // NEW
};
```

### 5.5 Entity Update Handler: Extract Classification

**File:** `frontend/src/components/map/TacticalMap.tsx`, in `processEntityUpdate()`

After extracting existing fields, add:

```typescript
// Extract classification from detail
const classification = entity.detail?.classification as EntityClassification | undefined;

// Store on entity
entitiesRef.current.set(entity.uid, {
    // ... existing fields ...
    classification,
});
```

---

## 6. Information Display Changes

### 6.1 SidebarRight — Enhanced Entity Details

**File:** `frontend/src/components/layouts/SidebarRight.tsx`

Replace the current TYPE_TAG and add classification-aware sections:

```
┌─────────────────────────────────────┐
│ ✈ IDENTIFIED_TARGET                  │
│ UAL1234                    [✕]       │
│                                      │
│ ┌──────────┐ ┌─────────────────────┐ │
│ │ a-f-A-C-F│ │ N12345              │ │
│ │ TYPE_TAG │ │ REGISTRATION        │ │
│ └──────────┘ └─────────────────────┘ │
│                                      │
│ ┌────────────────────────────────┐   │
│ │ BOEING 737-800 (B738)         │   │  ← NEW: Aircraft model
│ │ Operator: United Airlines     │   │  ← NEW: Operator
│ │ Category: Large (A3)          │   │  ← NEW: Weight class
│ └────────────────────────────────┘   │
│                                      │
│ [CENTER_VIEW]  [TRACK_LOG]           │
├──────────────────────────────────────┤
│ Positional_Telemetry                 │
│ LAT: 45.515200°   LON: -122.678400° │
│                                      │
│ Vector_Dynamics                      │
│ SPEED: 452.3 kts  HDG: 270°         │
│ ALT: 35,000 ft    VS: 0 fpm    ← NEW: Vertical speed │
│ SQUAWK: 3421      EMRG: NONE   ← NEW: Squawk + emergency │
│                                      │
│ 🧭 [Compass Widget]                 │
│                                      │
│ Metadata_Source                      │
│ TIME_TRACKED:   12.4s                │
│ Signal_Source:   ADSB_DIRECT         │
│ Classification:  COMMERCIAL     ← NEW │
│ Clearance:       LEVEL_01_PUBLIC     │
├──────────────────────────────────────┤
│ [RAW_PAYLOAD_EVAL]                   │
└──────────────────────────────────────┘
```

### 6.2 IntelFeed — Classification-Aware Events

**Current:** `"✈️ ASA19"` (no classification)

**Proposed:**

```
NEW  [HELO] [MIL] EVAC904 — UH-60 BLACKHAWK
NEW  ✈️ UAL1234 — B738
NEW  🚁 N412HP — BELL 412EP (LAW ENFORCEMENT)
LOST ✈️ [MIL] TOPCT25 — C-130J
ALERT 🚨 UAL555 — SQUAWK 7700 (EMERGENCY)
```

Extend `IntelEvent` to include classification:

```typescript
export interface IntelEvent {
    id: string;
    time: Date;
    type: 'new' | 'lost' | 'alert';
    message: string;
    entityType?: 'air' | 'sea';
    classification?: {          // NEW
        affiliation?: string;
        platform?: string;
        icaoType?: string;
    };
}
```

Generate richer event messages:

```typescript
const platformEmoji = cls?.platform === 'helicopter' ? '🚁' :
                      cls?.affiliation === 'military' ? '🔶' :
                      isShip ? '🚢' : '✈️';
const tags = [
    cls?.platform === 'helicopter' ? '[HELO]' : null,
    cls?.affiliation === 'military' ? '[MIL]' : null,
    cls?.affiliation === 'government' ? '[GOV]' : null,
].filter(Boolean).join(' ');

const typeStr = cls?.icaoType ? ` — ${cls.description || cls.icaoType}` : '';

onEvent?.({
    type: 'new',
    message: `${platformEmoji} ${tags ? tags + ' ' : ''}${callsign}${typeStr}`,
    entityType: isShip ? 'sea' : 'air',
    classification: cls ? { affiliation: cls.affiliation, platform: cls.platform, icaoType: cls.icaoType } : undefined,
});
```

### 6.3 SearchWidget — Show Aircraft Type

Add the ICAO type and affiliation badge to search results:

```
┌─────────────────────────────────────┐
│ 🔍 ASA19                            │
├─────────────────────────────────────┤
│ ✈️ ASA19                    LIVE    │
│    B738 · United Airlines · 3s ago  │  ← NEW: type + operator
├─────────────────────────────────────┤
│ 🚁 EVAC904               [MIL]     │  ← NEW: military badge
│    H60 · US Army · 12s ago          │
├─────────────────────────────────────┤
│ ✈️ N172SP                  HIST     │
│    C172 · 2h ago                    │
└─────────────────────────────────────┘
```

---

## 7. Filter System Extension

### 7.1 Current Filter Architecture

Two toggles in `LayerFilters.tsx`: AIR and SEA. Applied as binary skip/continue in the animation loop.

### 7.2 Extended Filter Design

Add sub-filters within each domain. The existing AIR/SEA toggles become domain-level master toggles, with classification sub-filters below:

```
┌─────────────────────────────────────┐
│ ⚡ Active Collection Filters         │
├─────────────────────────────────────┤
│ ✈ AIR  ●━━━━━━━●                   │  ← Master toggle (existing)
│   🚁 HELO    ●━━━━●                │  ← Sub-filter (new)
│   🔶 MIL     ●━━━━●                │  ← Sub-filter (new)
│   🏛 GOV     ●━━━━●                │  ← Sub-filter (new)
│                                      │
│ 🚢 SEA  ●━━━━━━━●                   │  ← Master toggle (existing)
└─────────────────────────────────────┘
```

### 7.3 Filter State

```typescript
const [filters, setFilters] = useState({
    showAir: true,
    showSea: true,
    // Sub-filters (only apply when master is on)
    showHelicopter: true,
    showMilitary: true,
    showGovernment: true,
});
```

### 7.4 Filter Application in Animation Loop

```typescript
// Existing domain filters
if (isShip && !filters?.showSea) continue;
if (!isShip && !filters?.showAir) continue;

// NEW: Sub-classification filters
const cls = entity.classification;
if (cls) {
    if (cls.platform === 'helicopter' && !filters?.showHelicopter) continue;
    if (cls.affiliation === 'military' && !filters?.showMilitary) continue;
    if (cls.affiliation === 'government' && !filters?.showGovernment) continue;
}
```

---

## 8. Performance Analysis

### 8.1 Backend Impact

| Change | Cost | Notes |
|--------|------|-------|
| Extract 10 additional fields in `normalize_to_tak()` | Negligible | Dictionary lookups, ~10μs per aircraft |
| Run `classify_aircraft()` | Low | String comparisons, ~20μs per aircraft |
| Larger Kafka messages (~200 bytes more) | Low | ~80KB/s additional at 400 aircraft × 1 msg/s |
| Protobuf encode with Classification | Low | Protobuf is efficient; ~100 additional bytes per message |

**Total backend impact:** <1% CPU increase, ~80KB/s additional network.

### 8.2 Frontend Impact

| Change | Cost | Notes |
|--------|------|-------|
| Larger icon atlas (512x128 vs 128x64) | None at runtime | One-time canvas generation at init; single GPU texture |
| `getIconName()` per entity per frame | Negligible | ~1μs per entity, branch-based lookup |
| Additional classification data in CoTEntity | Low | ~200 bytes per entity × 400 = 80KB total |
| Extended filter checks | Negligible | 2-3 additional boolean checks per entity per frame |
| Richer sidebar/feed rendering | None (render-triggered) | Only renders for selected entity or new events |

**Critical: Icon atlas with `mask: true`** — The 10-icon atlas is still a single 512x128 texture (65KB). deck.gl's IconLayer binds it once per frame. Switching from 2 icons to 10 icons does NOT add any draw calls or texture binds. The GPU workload is identical because all icons share one texture atlas. This is the same pattern used by tar1090 with 150+ icons.

**Total frontend impact:** <0.1% CPU increase. Zero additional GPU cost. ~80KB additional memory.

### 8.3 What NOT to Do

- **Don't use individual SVG/PNG files per icon type.** This forces one texture bind per icon type per frame — 10 textures × 60fps = 600 texture binds/second instead of 60. The canvas atlas avoids this entirely.
- **Don't dynamically generate icons based on classification.** Pre-compute all shapes at init.
- **Don't add classification as a React state dependency.** Keep it on the ref path (entitiesRef → entity.classification) to avoid re-render cascades.

---

## 9. Implementation Plan & Order

### Phase 1: Data Pipeline (Backend + Proto)
1. Extend `normalize_to_tak()` to extract classification fields
2. Add `classify_aircraft()` function
3. Derive proper CoT type string
4. Add `Classification` message to both proto files
5. Update backend proto encoder

### Phase 2: Frontend Types & Data Thread
6. Add `EntityClassification` type to `types.ts`
7. Extract classification in `processEntityUpdate()`
8. Store on CoTEntity

### Phase 3: Icon Atlas & Rendering
9. Expand `createIconAtlas()` with 10 shapes
10. Add `getIconName()` function
11. Update `IconLayer.getIcon` to use classification
12. Add military/government color treatments

### Phase 4: Information Display
13. Extend SidebarRight with classification data
14. Enrich IntelFeed event messages
15. Add type/operator to SearchWidget results

### Phase 5: Filters
16. Add sub-filter state to App.tsx
17. Extend LayerFilters.tsx with new toggles
18. Apply sub-filters in animation loop

---

## 10. Agent Prompts

### Prompt 1 — Backend: Extract Classification Fields & Extend normalize_to_tak

```
TASK: Extend the normalize_to_tak() function to extract classification-relevant
ADS-B fields and derive a proper entity classification.

FILE: backend/ingestion/poller/main.py

CONTEXT: The raw ADS-B data from adsb.fi/adsb.lol/airplanes.live contains rich
classification fields (t, category, dbFlags, ownOp, r, desc, squawk, emergency)
that are currently discarded. We need to extract them and thread them through
the TAK message.

CHANGES:

A) Add a classify_aircraft() method to PollerService (or as a module-level
   function) that takes the raw aircraft dict and returns a classification dict:
   {
     "affiliation": "military"|"government"|"commercial"|"general_aviation",
     "platform": "fixed_wing"|"helicopter"|"drone"|"balloon"|"glider"|"high_performance",
     "size": "light"|"small"|"large"|"heavy"|"high_performance"|"unknown",
     "icaoType": str,     # from ac["t"]
     "category": str,     # from ac["category"]
     "dbFlags": int,      # from ac["dbFlags"]
     "operator": str,     # from ac["ownOp"]
     "registration": str, # from ac["r"]
     "description": str,  # from ac["desc"]
     "squawk": str,       # from ac["squawk"]
     "emergency": str     # from ac["emergency"]
   }

   Classification logic priority:
   1. dbFlags & 1 → military
   2. ownOp match against known military operators → military
   3. ownOp match against known gov operators → government
   4. Hex range AE0000-AFFFFF → military (US only for now)
   5. Airline callsign pattern (3-letter ICAO prefix) or category A3-A5 → commercial
   6. Otherwise → general_aviation

   Platform logic:
   1. category == "A7" → helicopter
   2. First char of t field == "H" → helicopter
   3. category == "B6" → drone
   4. category == "B2" → balloon
   5. category == "B1" → glider
   6. category == "A6" → high_performance
   7. Otherwise → fixed_wing

   Include a small set of known military operator strings:
   ["United States Air Force", "United States Army", "United States Navy",
    "United States Marine Corps", "US Coast Guard", "Royal Air Force",
    "Royal Canadian Air Force", "Luftwaffe"]

   Include known gov operator strings:
   ["US Customs and Border Protection", "FBI", "Department of Homeland Security",
    "NASA", "State Police"]

B) In normalize_to_tak(), add the classification dict to detail:
   "detail": {
       "track": { ... },
       "contact": { ... },
       "classification": classify_aircraft(ac)
   }

C) Derive a proper CoT type string from the classification instead of
   hardcoding "a-f-A-C-F":
   - "a-f-A-M-H" for military helicopter
   - "a-f-A-M-F" for military fixed-wing
   - "a-f-A-C-F" for civilian fixed-wing
   - "a-f-A-C-H" for civilian helicopter
   Use: a-f-A-{M if military else C}-{H if helicopter else F}
   Keep "a-f-S-C-M" for maritime (no change).

D) Do NOT change the existing arbitration cache, timestamp logic, or polling
   logic. Only change what normalize_to_tak returns.

VERIFY: Run the poller against a live API and confirm the Kafka output includes
classification data. Check that military aircraft (dbFlags & 1) are correctly
tagged.
```

### Prompt 2 — Protobuf: Add Classification Message

```
TASK: Extend the TAK protobuf schema to include a Classification message.

FILES:
- backend/api/proto/tak.proto
- frontend/public/tak.proto
(Both files MUST be identical)

CHANGES:

A) Add a new Classification message after PrecisionLocation:

   message Classification {
     string affiliation = 1;
     string platform = 2;
     string size_class = 3;
     string icao_type = 4;
     string category = 5;
     uint32 db_flags = 6;
     string operator = 7;
     string registration = 8;
     string description = 9;
     string squawk = 10;
     string emergency = 11;
   }

B) Add the Classification field to the Detail message:

   message Detail {
     Contact contact = 1;
     Track track = 2;
     Group group = 3;
     Status status = 4;
     PrecisionLocation precisionLocation = 5;
     Classification classification = 6;    // NEW
     string xmlDetail = 100;
   }

C) BOTH proto files must be byte-identical. Copy the exact same content
   to both paths.

VERIFY: The protobuf compiler (protoc or protobufjs) can parse the schema
without errors. The TAK worker in the frontend will automatically decode
the new Classification fields when it loads the updated proto.
```

### Prompt 3 — Frontend: Add Classification Types & Thread Data

```
TASK: Add EntityClassification type to the frontend and thread classification
data from the TAK worker decode through to CoTEntity storage.

FILES:
- frontend/src/types.ts
- frontend/src/components/map/TacticalMap.tsx

CHANGES:

A) In types.ts, add the EntityClassification interface:

   export interface EntityClassification {
       affiliation?: string;
       platform?: string;
       sizeClass?: string;
       icaoType?: string;
       category?: string;
       dbFlags?: number;
       operator?: string;
       registration?: string;
       description?: string;
       squawk?: string;
       emergency?: string;
   }

   Add to CoTEntity:
   classification?: EntityClassification;

B) In TacticalMap.tsx processEntityUpdate(), after extracting the existing
   fields, extract classification from the decoded proto detail:

   const classification = entity.detail?.classification as
       EntityClassification | undefined;

   Include it in the entitiesRef.current.set() call:
   entitiesRef.current.set(entity.uid, {
       ...existing fields...,
       classification: classification || existingEntity?.classification,
   });

   Use || existingEntity?.classification to preserve classification across
   updates where it might not be present (partial updates).

C) Also thread classification through to the interpolatedEntity object in the
   animation loop, so it's available for icon selection and sidebar display:

   const interpolatedEntity: CoTEntity = {
       ...entity,
       lon: visual.lon,
       lat: visual.lat,
       altitude: visual.alt,
       classification: entity.classification,
   };

VERIFY: Select an aircraft in the UI and check that entity.classification
contains data in the browser console. The TAK worker automatically decodes
proto fields, so no worker changes are needed.
```

### Prompt 4 — Icon Atlas: Expand to 10 Distinct Shapes

```
TASK: Replace the 2-icon canvas atlas with a 10-icon atlas that visually
distinguishes helicopters, military jets, airliners, GA aircraft, and vessels.

FILE: frontend/src/components/map/TacticalMap.tsx

CHANGES:

A) Replace the createIconAtlas() function (lines 22-63) with an expanded
   version that generates a 512x128 canvas (8 columns × 2 rows, 64px cells).

   Draw these 10 icons using canvas 2D path operations (white fill, centered
   in each 64x64 cell, pointing UP so getAngle rotation works correctly):

   1. jet_large (0,0): Swept-wing airliner profile
      - Tapered fuselage, swept-back wings, small tail fin
      - Wider wingspan than jet_small

   2. jet_small (1,0): Business/small jet profile
      - Slim fuselage, moderate swept wings, T-tail

   3. turboprop (2,0): Straight-wing with prop indicators
      - Straight wings (not swept), two small circles for props

   4. prop_single (3,0): Small high-wing Cessna-style
      - High straight wing, simple fuselage, single prop circle

   5. helicopter (4,0): Rotor disc + fuselage
      - Large circle or disc on top, slim fuselage below, tail boom
      - Distinctly different silhouette from fixed-wing

   6. military_fast (5,0): Delta-wing fighter
      - Delta or highly-swept wings, narrow fuselage, twin tails

   7. military_transport (6,0): C-130 style
      - High straight wing, 4 engine dots, fat fuselage, T-tail

   8. drone (7,0): Small UAV shape
      - Slim body, long narrow wings, V-tail, no cockpit bubble

   9. vessel (0,1): Ship hull
      - Pointed bow, flat stern, small superstructure

   10. unknown (1,1): Current chevron (backward compatible fallback)
       - The existing chevron shape (lines 30-38)

   All icons: white fill, mask: true, anchorY: CELL/2

B) Add a getIconName() function that maps entity classification to icon name:

   function getIconName(entity: CoTEntity): string {
       const cls = entity.classification;
       const isShip = entity.type?.includes('S');
       if (isShip) return 'vessel';
       if (!cls) return 'unknown';

       if (cls.platform === 'helicopter') return 'helicopter';
       if (cls.platform === 'drone') return 'drone';

       if (cls.affiliation === 'military') {
           if (cls.platform === 'high_performance' || cls.category === 'A6')
               return 'military_fast';
           if (cls.sizeClass === 'heavy' || cls.sizeClass === 'large')
               return 'military_transport';
           return 'military_fast';
       }

       if (cls.sizeClass === 'heavy' || cls.sizeClass === 'large') return 'jet_large';
       if (cls.sizeClass === 'small') return 'jet_small';
       if (cls.sizeClass === 'light') return 'prop_single';

       if (cls.category) {
           const cat = cls.category;
           if (['A3','A4','A5'].includes(cat)) return 'jet_large';
           if (cat === 'A2') return 'jet_small';
           if (cat === 'A1') return 'prop_single';
       }

       return 'unknown';
   }

C) Update the IconLayer getIcon callback (around line 1085) to use
   getIconName():

   BEFORE:
   getIcon: (d: CoTEntity) => {
       const isVessel = d.type.includes('S');
       return isVessel ? 'vessel' : 'aircraft';
   }

   AFTER:
   getIcon: (d: CoTEntity) => getIconName(d)

IMPORTANT CONSTRAINTS:
- All icons must be drawn as simple canvas paths (lineTo, arc, bezierCurveTo)
- No external image loading — everything generated procedurally
- All icons white fill with mask: true for dynamic coloring
- Icons should be recognizable at 24-32px display size
- Each icon must point UP (north) — rotation handled by getAngle
- Keep it simple — silhouettes, not detailed illustrations

VERIFY: Load the map and confirm you see different icon shapes for
helicopters vs airliners vs military. The classification data must be
flowing from the backend (Prompt 1-3 must be done first).
```

### Prompt 5 — Sidebar & Feed: Display Classification Intelligence

```
TASK: Update SidebarRight, IntelFeed, and SearchWidget to display aircraft
classification data.

FILES:
- frontend/src/components/layouts/SidebarRight.tsx
- frontend/src/components/widgets/IntelFeed.tsx
- frontend/src/components/widgets/SearchWidget.tsx
- frontend/src/types.ts (IntelEvent extension)

CHANGES:

A) SidebarRight.tsx: Add a classification section after the TYPE_TAG/UID row
   in the header area. If entity.classification exists, show:
   - Aircraft model: classification.description or classification.icaoType
   - Operator: classification.operator (if present)
   - Registration: classification.registration (if present)
   - Category badge: classification.affiliation in a colored pill/badge
     (amber for military, blue for government, green for commercial, gray for GA)

   In the Vector_Dynamics section, add:
   - Squawk: classification.squawk (if present and not empty)
   - Emergency: classification.emergency (if not "none", show in RED)

   If the entity is military (classification.affiliation === "military"),
   apply an amber-tinted accent color instead of the standard air/sea accent.

B) IntelFeed: Extend IntelEvent in types.ts to include an optional
   classification field:
   classification?: { affiliation?: string; platform?: string; icaoType?: string }

   In TacticalMap.tsx where events are generated (new entity events around
   line 685, lost entity events around line 970):
   - Add emoji based on platform: 🚁 for helicopter, 🔶 for military, ✈️ default
   - Add tags: [MIL], [GOV], [HELO] as appropriate
   - Add aircraft type: " — B738" or " — UH-60" if icaoType is present
   - Include classification in the event object

   In IntelFeed.tsx, use the classification data for styling:
   - Military events: amber accent
   - Government events: white accent
   - Emergency events: red accent with bell icon

C) SearchWidget.tsx: In the results list, add a subtitle line showing:
   - Aircraft type (classification.icaoType)
   - Operator (classification.operator)
   - Affiliation badge ([MIL], [GOV]) if applicable

   This data should come from the entity.classification field in the
   SearchResult interface (extend it with an optional classification field).

VERIFY:
1. Select a military aircraft — sidebar should show amber-tinted header
   with operator name and registration
2. New helicopter event should show 🚁 [HELO] prefix in intel feed
3. Search for an aircraft — results should show type code and operator
```

### Prompt 6 — Filters: Add Classification Sub-Filters

```
TASK: Extend the filter system with sub-filters for helicopter, military,
and government entities.

FILES:
- frontend/src/App.tsx
- frontend/src/components/widgets/LayerFilters.tsx
- frontend/src/components/map/TacticalMap.tsx

CHANGES:

A) App.tsx: Extend the filters state (around line 22):
   const [filters, setFilters] = useState({
       showAir: true,
       showSea: true,
       showHelicopter: true,
       showMilitary: true,
       showGovernment: true,
   });

   Update the handleFilterChange type to accept any filter key:
   const handleFilterChange = (key: string, value: boolean) => {
       setFilters(prev => ({ ...prev, [key]: value }));
   };

B) LayerFilters.tsx: Add three new toggle rows below the AIR toggle,
   visually indented to show they are sub-filters of AIR:
   - 🚁 HELO toggle (showHelicopter)
   - 🔶 MIL toggle (showMilitary)
   - 🏛 GOV toggle (showGovernment)

   These should only appear when showAir is true (they are sub-filters).
   Use a smaller size and slight left indent to show hierarchy.
   Update the Props interface to accept the extended filter type.

C) TacticalMap.tsx: In the animation loop, after the existing domain
   filters (lines 851-852), add classification sub-filters:

   // Existing
   if (isShip && !filters?.showSea) continue;
   if (!isShip && !filters?.showAir) continue;

   // NEW: Sub-classification filters (only for air domain)
   if (!isShip && entity.classification) {
       const cls = entity.classification;
       if (cls.platform === 'helicopter' && filters?.showHelicopter === false) continue;
       if (cls.affiliation === 'military' && filters?.showMilitary === false) continue;
       if (cls.affiliation === 'government' && filters?.showGovernment === false) continue;
   }

   Note: Use === false (not !filters.showX) to treat undefined as "show"
   for backward compatibility.

VERIFY:
1. Toggle HELO off — all helicopters should disappear from the map
2. Toggle MIL off — all military aircraft should disappear
3. Toggle AIR off — ALL aircraft disappear (master toggle overrides sub-filters)
4. Toggle AIR back on — sub-filter states are preserved
5. Track counts in the HUD should still reflect filtered entities
```

---

## Appendix A — ADS-B Category Quick Reference

```
A0 = No info        A1 = Light (<15.5k lbs)    A2 = Small (15-75k)
A3 = Large (75-300k) A4 = HiVortex (757)       A5 = Heavy (>300k)
A6 = HiPerf (fighter) A7 = Rotorcraft

B1 = Glider          B2 = Balloon              B4 = Ultralight
B6 = Drone/UAV

C1 = Emergency vehicle  C2 = Service vehicle
```

## Appendix B — Common Military Type Designators

| Code | Aircraft | Platform |
|------|----------|----------|
| `F16` | F-16 Fighting Falcon | Fighter |
| `F18S` | F/A-18E/F Super Hornet | Fighter |
| `F35` | F-35 Lightning II | Fighter |
| `A10` | A-10 Thunderbolt II | Attack |
| `B52` | B-52 Stratofortress | Bomber |
| `C130` | C-130 Hercules | Transport |
| `C17` | C-17 Globemaster III | Transport |
| `C5` | C-5 Galaxy | Transport |
| `KC10` | KC-10 Extender | Tanker |
| `KC46` | KC-46 Pegasus | Tanker |
| `E3CF` | E-3 Sentry (AWACS) | Surveillance |
| `P8` | P-8 Poseidon | Maritime Patrol |
| `H60` | UH-60 Black Hawk | Helicopter |
| `H47` | CH-47 Chinook | Helicopter |
| `H64` | AH-64 Apache | Helicopter |
| `V22` | V-22 Osprey | Tiltrotor |

## Appendix C — dbFlags Bitmask Reference

```
dbFlags & 1  = Military
dbFlags & 2  = Interesting (noteworthy aircraft)
dbFlags & 4  = PIA (Privacy ICAO Address — hex is obfuscated)
dbFlags & 8  = LADD (FAA privacy program — data display limited)

Examples:
  0  = Normal civilian
  1  = Military
  2  = Interesting civilian
  3  = Military + Interesting
  5  = Military + PIA (spoofed hex)
  8  = LADD program (privacy)
  12 = PIA + LADD
```

---

*Report generated from analysis of Sovereign Watch v0.5.0 and industry flight tracking research*
*Affected files: `backend/ingestion/poller/main.py`, `backend/api/proto/tak.proto`, `frontend/public/tak.proto`, `frontend/src/types.ts`, `frontend/src/components/map/TacticalMap.tsx`, `frontend/src/components/layouts/SidebarRight.tsx`, `frontend/src/components/widgets/IntelFeed.tsx`, `frontend/src/components/widgets/SearchWidget.tsx`, `frontend/src/components/widgets/LayerFilters.tsx`, `frontend/src/App.tsx`*
*Analysis date: 2026-02-17*
