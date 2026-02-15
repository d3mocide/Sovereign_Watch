# Master Implementation Prompt: Enhanced Flight & Maritime Rendering

> **Agent Directive**: Implement all changes described below across the Sovereign Watch frontend. Every section is a discrete task. Implement them sequentially. Do NOT skip any section. Do NOT add features beyond what is specified. After all sections are complete, verify the app builds with `npm run build` from `frontend/`.

---

## Context

**Stack**: React 19 + MapLibre GL + Deck.gl (via `@deck.gl/mapbox` `MapboxOverlay`) + TypeScript + Vite
**Primary file**: `frontend/src/components/map/TacticalMap.tsx` (~718 lines)
**Types file**: `frontend/src/types.ts`
**Sidebar**: `frontend/src/components/layouts/SidebarRight.tsx`
**Tooltip**: `frontend/src/components/map/MapTooltip.tsx`

The app renders real-time ADSB (aircraft) and AIS (maritime) CoT entities on a Deck.gl overlay atop MapLibre. Data arrives via WebSocket → Web Worker → protobuf decode → `entitiesRef` Map. An `requestAnimationFrame` loop rebuilds Deck.gl layers every frame.

Entity discrimination: `entity.type.includes('S')` → maritime, else → aviation.

---

## Section 0: Extend TrailPoint Type

**File**: `frontend/src/types.ts`

Add a `speed` field to trail data so per-vertex speed coloring is possible for maritime trails.

```typescript
// BEFORE
export type TrailPoint = [number, number, number]; // [lon, lat, altitude]

// AFTER
export type TrailPoint = [number, number, number, number]; // [lon, lat, altitude, speed]
```

Update the trail push in `TacticalMap.tsx` (around line 217) to include speed:

```typescript
// BEFORE
trail = [...trail, [newLon, newLat, entity.hae || 0] as TrailPoint].slice(-100);

// AFTER
const speed = entity.detail?.track?.speed || 0;
trail = [...trail, [newLon, newLat, entity.hae || 0, speed] as TrailPoint].slice(-100);
```

---

## Section 1: Utility Functions

Add the following utility functions to `TacticalMap.tsx` immediately after the `getDistanceMeters` function (after line 45). These are pure functions with no side effects — place them at module scope, NOT inside the component.

### 1A: Circular Angle Interpolation

```typescript
/** Interpolate between two angles on the shortest arc */
function lerpAngle(a: number, b: number, t: number): number {
    const delta = ((b - a + 540) % 360) - 180;
    return (a + delta * t + 360) % 360;
}
```

### 1B: Chaikin Corner-Cutting Smoothing (3D)

```typescript
/** Chaikin's corner-cutting algorithm for smooth 3D paths */
function smoothPath3D(points: TrailPoint[], iterations: number = 2): TrailPoint[] {
    if (points.length < 3) return points;
    let current = points;
    for (let iter = 0; iter < iterations; iter++) {
        const next: TrailPoint[] = [current[0]];
        for (let i = 0; i < current.length - 1; i++) {
            const a = current[i];
            const b = current[i + 1];
            next.push([
                a[0] * 0.75 + b[0] * 0.25,
                a[1] * 0.75 + b[1] * 0.25,
                a[2] * 0.75 + b[2] * 0.25,
                a[3] * 0.75 + b[3] * 0.25,
            ] as TrailPoint);
            next.push([
                a[0] * 0.25 + b[0] * 0.75,
                a[1] * 0.25 + b[1] * 0.75,
                a[2] * 0.25 + b[2] * 0.75,
                a[3] * 0.25 + b[3] * 0.75,
            ] as TrailPoint);
        }
        next.push(current[current.length - 1]);
        current = next;
    }
    return current;
}
```

### 1C: Continuous Altitude Color Gradient (10-stop, gamma-corrected)

Replaces the 4-step function for aviation. Returns `[R, G, B, A]`.

```typescript
/** 10-stop altitude color gradient with gamma correction */
const ALTITUDE_STOPS: [number, [number, number, number]][] = [
    [0.00, [72, 210, 160]],   // Teal (ground)
    [0.10, [100, 200, 120]],  // Green
    [0.20, [160, 195, 80]],   // Yellow-green
    [0.30, [210, 180, 60]],   // Gold
    [0.40, [235, 150, 60]],   // Orange
    [0.52, [240, 110, 80]],   // Red-orange
    [0.64, [220, 85, 130]],   // Pink
    [0.76, [180, 90, 190]],   // Purple
    [0.88, [120, 110, 220]],  // Indigo
    [1.00, [100, 170, 240]],  // Sky blue (high cruise)
];

function altitudeToColor(altitudeMeters: number, alpha: number = 220): [number, number, number, number] {
    if (altitudeMeters == null || altitudeMeters < 0) return [100, 100, 100, alpha];
    const MAX_ALT = 13000; // meters
    const normalized = Math.min(altitudeMeters / MAX_ALT, 1.0);
    const t = Math.pow(normalized, 0.4); // Gamma compress — more variation at low altitudes

    // Find surrounding stops
    for (let i = 0; i < ALTITUDE_STOPS.length - 1; i++) {
        const [t0, c0] = ALTITUDE_STOPS[i];
        const [t1, c1] = ALTITUDE_STOPS[i + 1];
        if (t >= t0 && t <= t1) {
            const f = (t - t0) / (t1 - t0);
            return [
                Math.round(c0[0] + (c1[0] - c0[0]) * f),
                Math.round(c0[1] + (c1[1] - c0[1]) * f),
                Math.round(c0[2] + (c1[2] - c0[2]) * f),
                alpha,
            ];
        }
    }
    const last = ALTITUDE_STOPS[ALTITUDE_STOPS.length - 1][1];
    return [last[0], last[1], last[2], alpha];
}
```

### 1D: Maritime Speed Color Gradient (5-stop)

```typescript
/** Speed-based color for maritime entities (knots) */
const SPEED_STOPS_KTS: [number, [number, number, number]][] = [
    [0,  [0, 150, 255]],    // Blue — Anchored/Drifting
    [2,  [0, 220, 180]],    // Teal — Maneuvering
    [8,  [0, 255, 100]],    // Green — Cruising (cargo)
    [15, [255, 220, 0]],    // Yellow — Fast transit
    [25, [255, 80, 50]],    // Red — High speed
];

function speedToColor(speedMs: number, alpha: number = 220): [number, number, number, number] {
    const kts = speedMs * 1.94384;
    for (let i = 0; i < SPEED_STOPS_KTS.length - 1; i++) {
        const [s0, c0] = SPEED_STOPS_KTS[i];
        const [s1, c1] = SPEED_STOPS_KTS[i + 1];
        if (kts >= s0 && kts <= s1) {
            const f = (kts - s0) / (s1 - s0);
            return [
                Math.round(c0[0] + (c1[0] - c0[0]) * f),
                Math.round(c0[1] + (c1[1] - c0[1]) * f),
                Math.round(c0[2] + (c1[2] - c0[2]) * f),
                alpha,
            ];
        }
    }
    // Above max stop
    const last = SPEED_STOPS_KTS[SPEED_STOPS_KTS.length - 1][1];
    return [last[0], last[1], last[2], alpha];
}
```

### 1E: Entity Color Dispatcher

Single function used by icons, glows, and trails to get the correct color for any entity type:

```typescript
/** Unified color for any entity based on type */
function entityColor(entity: CoTEntity, alpha: number = 220): [number, number, number, number] {
    if (entity.type.includes('S')) {
        return speedToColor(entity.speed, alpha);
    }
    return altitudeToColor(entity.altitude, alpha);
}
```

---

## Section 2: Canvas-Drawn Icon Atlas (Aircraft + Vessel Silhouettes)

**Delete** the existing `TRIANGLE_ICON` constant (line 15). Replace it with a pre-packed canvas icon atlas that contains both a recognizable top-down aircraft silhouette and a top-down ship hull. This replaces the generic kite chevron with shapes that are instantly identifiable.

Place this code at **module scope**, right after the imports (replacing line 14-15):

```typescript
// ============================================================
// Tactical Icon Atlas — Canvas-drawn, pre-packed sprite sheet
// Two 128x128 cells: [aircraft | vessel] in a 256x128 canvas
// ============================================================
const ICON_CELL = 128;

function createTacticalIconAtlas(): string {
    if (typeof document === 'undefined') return '';

    const canvas = document.createElement('canvas');
    canvas.width = 256;       // 2 cells wide
    canvas.height = ICON_CELL; // 1 cell tall
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, ICON_CELL);

    // === AIRCRAFT (cell 0: x=0..127) ===
    // Top-down silhouette, nose pointing UP toward y=0
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(64, 6);       // Nose tip
    ctx.lineTo(71, 19);      // Right nose
    ctx.lineTo(71, 33);      // Right fuselage before wing
    ctx.lineTo(100, 44);     // Right wing leading edge
    ctx.lineTo(106, 52);     // Right wingtip
    ctx.lineTo(80, 53);      // Right wing trailing edge
    ctx.lineTo(72, 56);      // Right fuselage after wing
    ctx.lineTo(72, 88);      // Right fuselage before tail
    ctx.lineTo(90, 101);     // Right tailplane tip
    ctx.lineTo(88, 108);     // Right tail trailing edge
    ctx.lineTo(69, 99);      // Right tail junction
    ctx.lineTo(69, 121);     // Right tail fin
    ctx.lineTo(64, 126);     // Tail center
    ctx.lineTo(59, 121);     // Left tail fin
    ctx.lineTo(59, 99);      // Left tail junction
    ctx.lineTo(40, 108);     // Left tail trailing edge
    ctx.lineTo(38, 101);     // Left tailplane tip
    ctx.lineTo(56, 88);      // Left fuselage before tail
    ctx.lineTo(56, 56);      // Left fuselage after wing
    ctx.lineTo(48, 53);      // Left wing trailing edge
    ctx.lineTo(22, 52);      // Left wingtip
    ctx.lineTo(28, 44);      // Left wing leading edge
    ctx.lineTo(57, 33);      // Left fuselage before wing
    ctx.lineTo(57, 19);      // Left nose
    ctx.closePath();
    ctx.fill();

    // Cockpit cutout (transparent hole for detail)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(64, 13);
    ctx.lineTo(67, 19);
    ctx.lineTo(64, 24);
    ctx.lineTo(61, 19);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // === VESSEL (cell 1: x=128..255) ===
    // Top-down ship hull, bow pointing UP toward y=0
    const ox = 128; // x-offset for vessel cell
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(ox + 64, 8);      // Bow tip
    ctx.lineTo(ox + 74, 28);     // Right bow curve
    ctx.lineTo(ox + 78, 48);     // Right forward hull
    ctx.lineTo(ox + 80, 60);     // Right mid hull
    ctx.lineTo(ox + 80, 85);     // Widest beam, starboard
    ctx.lineTo(ox + 76, 105);    // Right stern taper
    ctx.lineTo(ox + 72, 115);    // Right stern corner
    ctx.lineTo(ox + 56, 115);    // Left stern corner
    ctx.lineTo(ox + 52, 105);    // Left stern taper
    ctx.lineTo(ox + 48, 85);     // Widest beam, port
    ctx.lineTo(ox + 48, 60);     // Left mid hull
    ctx.lineTo(ox + 50, 48);     // Left forward hull
    ctx.lineTo(ox + 54, 28);     // Left bow curve
    ctx.closePath();
    ctx.fill();

    // Bridge superstructure (semi-transparent for subtle detail under mask tinting)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(ox + 54, 76, 20, 14);

    // Bow centerline detail
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox + 64, 14);
    ctx.lineTo(ox + 64, 45);
    ctx.stroke();

    return canvas.toDataURL();
}

// Cache the atlas globally — created once, reused forever
let _tacticalAtlasUrl: string | undefined;
function getTacticalAtlasUrl(): string {
    if (!_tacticalAtlasUrl) _tacticalAtlasUrl = createTacticalIconAtlas();
    return _tacticalAtlasUrl;
}

// Pre-packed icon mapping (atlas coordinates)
// anchorX/anchorY are ABSOLUTE positions in the atlas, not relative to the cell
const TACTICAL_ICON_MAPPING: Record<string, { x: number; y: number; width: number; height: number; anchorX: number; anchorY: number; mask: boolean }> = {
    aircraft: {
        x: 0, y: 0,
        width: ICON_CELL, height: ICON_CELL,
        anchorX: 64, anchorY: 64,
        mask: true,
    },
    vessel: {
        x: ICON_CELL, y: 0,
        width: ICON_CELL, height: ICON_CELL,
        anchorX: ICON_CELL + 64, // 192 — absolute atlas x for center of vessel cell
        anchorY: 64,
        mask: true,
    },
};
```

**Why canvas atlas over SVG data URIs:**
- Single texture upload to GPU (pre-packed). Current code uses auto-packing (`getIcon` returning an object), which re-packs on every new icon instance.
- Canvas atlas is what the Aeris flight tracker uses in production with Deck.gl 9.
- `mask: true` uses the alpha channel for shape — cockpit cutout (`destination-out`) and bridge superstructure (`rgba 0.55 alpha`) create visible detail even when tinted by `getColor`.
- Both shapes have "forward" pointing UP (toward y=0), matching the existing `getAngle: (d) => -(d.course || 0)` rotation convention.

---

## Section 3: Heading Damping State

Add a ref to store previous smoothed course values, right after the existing `currentMissionRef` (around line 70):

```typescript
const prevCourseRef = useRef<Map<string, number>>(new Map());
```

Then inside the `worker.onmessage` handler, AFTER the line that sets `entitiesRef.current.set(...)` (after line 233), add heading damping:

```typescript
// Smooth course transitions
const prevCourse = prevCourseRef.current.get(entity.uid);
const rawCourse = entity.detail?.track?.course || 0;
const smoothedCourse = prevCourse != null ? lerpAngle(prevCourse, rawCourse, 0.18) : rawCourse;
prevCourseRef.current.set(entity.uid, smoothedCourse);

// Update the entity with smoothed course
const stored = entitiesRef.current.get(entity.uid)!;
stored.course = smoothedCourse;
```

Also, in the stale entity cleanup loop (around line 334, after `entities.delete(uid)`), add:

```typescript
prevCourseRef.current.delete(uid);
```

And in the mission clear effect (around line 149, after `entitiesRef.current.clear()`), add:

```typescript
prevCourseRef.current.clear();
```

---

## Section 4: Position Interpolation (Snapshot System)

Add snapshot refs after `prevCourseRef`:

```typescript
const prevSnapshotsRef = useRef<Map<string, { lon: number; lat: number; ts: number }>>(new Map());
const currSnapshotsRef = useRef<Map<string, { lon: number; lat: number; ts: number }>>(new Map());
```

In the `worker.onmessage` handler, BEFORE `entitiesRef.current.set(...)`, capture snapshots:

```typescript
// Snapshot for interpolation
const currSnap = currSnapshotsRef.current.get(entity.uid);
if (currSnap && (currSnap.lon !== newLon || currSnap.lat !== newLat)) {
    prevSnapshotsRef.current.set(entity.uid, { ...currSnap });
}
currSnapshotsRef.current.set(entity.uid, { lon: newLon, lat: newLat, ts: Date.now() });
```

In the stale entity cleanup (after `prevCourseRef.current.delete(uid)`):

```typescript
prevSnapshotsRef.current.delete(uid);
currSnapshotsRef.current.delete(uid);
```

In the mission clear effect (after `prevCourseRef.current.clear()`):

```typescript
prevSnapshotsRef.current.clear();
currSnapshotsRef.current.clear();
```

Then, inside the `animate` function, BEFORE the layer construction (`const layers = [`), add the interpolation logic:

```typescript
// Interpolate entity positions for smooth movement
const interpolated: CoTEntity[] = [];
for (const entity of entities.values()) {
    const isShip = entity.type?.includes('S');
    if (isShip && !filters?.showSea) continue;
    if (!isShip && !filters?.showAir) continue;

    const prev = prevSnapshotsRef.current.get(entity.uid);
    const curr = currSnapshotsRef.current.get(entity.uid);

    if (prev && curr && curr.ts > prev.ts) {
        const elapsed = now - curr.ts;
        const duration = curr.ts - prev.ts;
        const t = Math.min(elapsed / Math.max(duration, 100), 2.0); // cap extrapolation at 2x

        const lon = prev.lon + (curr.lon - prev.lon) * t;
        const lat = prev.lat + (curr.lat - prev.lat) * t;
        interpolated.push({ ...entity, lon, lat });
    } else {
        interpolated.push(entity);
    }
}
```

---

## Section 5: Replace Layer Stack

Replace the entire `const layers = [...]` block (lines 377–495) with the new layer stack below. This replaces the old selected-only trail, heading arrows, and glow layers.

### 5A: All-Entity Trails (PathLayer)

Render smoothed trails for ALL visible entities — not just the selected one. Use per-vertex coloring with opacity fade.

```typescript
const layers = [
    // 1. All-Entity Smoothed Trails
    ...interpolated
        .filter(e => e.trail.length > 2)
        .map(e => {
            const smooth = smoothPath3D(e.trail, 2);
            const isShip = e.type.includes('S');
            const isSelected = selectedEntity?.uid === e.uid;

            // Per-vertex color with opacity fade (old = faint, new = solid)
            const colors = smooth.map((pt, i) => {
                const t = smooth.length > 1 ? i / (smooth.length - 1) : 1;
                const alpha = Math.round(40 + Math.pow(t, 1.65) * 180); // 40 → 220
                if (isShip) {
                    return speedToColor(pt[3], alpha);
                }
                return altitudeToColor(pt[2], alpha);
            });

            return new PathLayer({
                id: `trail-${e.uid}`,
                data: [{ path: smooth.map(p => [p[0], p[1], p[2]]), colors }],
                getPath: (d: any) => d.path,
                getColor: (d: any) => d.colors,
                getWidth: isSelected ? 3 : 1.5,
                widthMinPixels: isSelected ? 2.5 : 1,
                pickable: false,
                jointRounded: true,
                capRounded: true,
                opacity: isSelected ? 1.0 : 0.6,
            });
        }),
```

**IMPORTANT**: The Deck.gl `PathLayer` does not natively support per-vertex colors via a flat `getColor` accessor on single-path data. If per-vertex coloring causes issues at build/runtime, fall back to a simpler approach:

```typescript
// Fallback: single color per trail, opacity varies by selection
getColor: isShip
    ? speedToColor(e.speed, isSelected ? 180 : 100)
    : altitudeToColor(e.altitude, isSelected ? 180 : 100),
```

### 5B: Heading Icons (IconLayer) — Pre-Packed Atlas

Uses the canvas-drawn atlas from Section 2. Key changes from the old auto-packing approach:
- `iconAtlas` and `iconMapping` are set at the layer level (single GPU texture)
- `getIcon` returns a **string key** (`'aircraft'` or `'vessel'`), NOT an object
- `billboard: false` so icons rotate with the map bearing (correct for tactical heading indicators)
- `sizeUnits: 'pixels'` for consistent display size regardless of zoom

```typescript
    // 2. Heading Arrows (Primary Tactical Markers — Pre-packed Atlas)
    new IconLayer({
        id: 'heading-arrows',
        data: interpolated,
        iconAtlas: getTacticalAtlasUrl(),
        iconMapping: TACTICAL_ICON_MAPPING,
        getIcon: (d: any) => d.type?.includes('S') ? 'vessel' : 'aircraft',
        getPosition: (d: any) => [d.lon, d.lat, d.altitude || 0],
        getSize: (d: any) => selectedEntity?.uid === d.uid ? 32 : 24,
        sizeUnits: 'pixels' as const,
        billboard: false,
        getAngle: (d: any) => -(d.course || 0),
        getColor: (d: any) => entityColor(d as CoTEntity),
        pickable: true,
        onHover: (info: { object?: any; x: number; y: number }) => {
            if (info.object) {
                setHoveredEntity(info.object as CoTEntity);
                setHoverPosition({ x: info.x, y: info.y });
            } else {
                setHoveredEntity(null);
                setHoverPosition(null);
            }
        },
        onClick: (info: { object?: any }) => {
            if (info.object) {
                const entity = info.object as CoTEntity;
                const newSelection = selectedEntity?.uid === entity.uid ? null : entity;
                onEntitySelect(newSelection);
            } else {
                onEntitySelect(null);
            }
        },
        updateTriggers: {
            getSize: [selectedEntity?.uid],
        }
    }),
```

### 5C: Glow Layer (ScatterplotLayer) — Updated

Uses `entityColor()` for glow color matching:

```typescript
    // 3. Halo / Glow Layer
    new ScatterplotLayer({
        id: 'entity-glow',
        data: interpolated,
        getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
        getRadius: (d: CoTEntity) => {
            const isSelected = selectedEntity?.uid === d.uid;
            const offset = d.uid.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) * 100;
            const pulse = (Math.sin((now + offset) / 600) + 1) / 2;
            const base = isSelected ? 20 : 6;
            return base * (1 + (pulse * 0.1));
        },
        radiusUnits: 'pixels' as const,
        getFillColor: (d: CoTEntity) => {
            const isSelected = selectedEntity?.uid === d.uid;
            const offset = d.uid.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) * 100;
            const pulse = (Math.sin((now + offset) / 600) + 1) / 2;
            const baseAlpha = isSelected ? 60 : 10;
            const a = baseAlpha * (0.8 + pulse * 0.2);
            return entityColor(d, a);
        },
        pickable: false,
        updateTriggers: { getRadius: [now], getFillColor: [now] }
    }),

    // 4. Selected Entity Expanding Ring
    ...(selectedEntity ? [
        new ScatterplotLayer({
            id: 'selection-ring',
            data: interpolated.filter(e => e.uid === selectedEntity.uid),
            getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
            getRadius: () => {
                const cycle = (now % 3000) / 3000; // 3 second cycle
                return 15 + cycle * 35; // Expand from 15 to 50 pixels
            },
            radiusUnits: 'pixels' as const,
            getFillColor: [0, 0, 0, 0],
            getLineColor: () => {
                const cycle = (now % 3000) / 3000;
                const alpha = Math.round(180 * (1 - Math.pow(cycle, 2))); // Fade out quadratically
                return entityColor(selectedEntity, alpha);
            },
            getLineWidth: 2,
            stroked: true,
            filled: false,
            pickable: false,
            updateTriggers: { getRadius: [now], getLineColor: [now] }
        })
    ] : []),
];
```

Close the layers array properly. The `];` at the end terminates the array.

---

## Section 6: Update SidebarRight Speed Color

**File**: `frontend/src/components/layouts/SidebarRight.tsx`

In the kinematics section, the SPEED_KTS value currently uses `accentColor` (flat sea-green or air-cyan). Update the speed display to reflect the new dynamic color for maritime entities.

Find the SPEED_KTS `<span>` (around line 111-113) and replace:

```typescript
// BEFORE
<span className={`text-mono-base font-bold ${accentColor} tabular-nums`}>
    {(entity.speed * 1.94384).toFixed(1)}
</span>

// AFTER
<span className={`text-mono-base font-bold tabular-nums`} style={isShip ? {
    color: `rgb(${(() => {
        const kts = entity.speed * 1.94384;
        if (kts <= 2) return '0,150,255';
        if (kts <= 8) return '0,220,180';
        if (kts <= 15) return '0,255,100';
        if (kts <= 25) return '255,220,0';
        return '255,80,50';
    })()})`
} : undefined}>
    <span className={isShip ? '' : accentColor}>
        {(entity.speed * 1.94384).toFixed(1)}
    </span>
</span>
```

Also update the ALTITUDE_FT display (around line 124-131) to use the same gradient logic for aircraft:

```typescript
// BEFORE — step function color classes
if (ft < 200) return 'text-sky-400';
if (ft < 5000) return 'text-yellow-400';
if (ft < 25000) return 'text-orange-400';
return 'text-red-400';

// AFTER — finer gradient (matches 10-stop scale)
const norm = Math.min(ft / 42650, 1.0); // 42650 ft ≈ 13000m
const g = Math.pow(norm, 0.4);
if (g < 0.15) return 'text-teal-400';
if (g < 0.30) return 'text-green-400';
if (g < 0.45) return 'text-yellow-400';
if (g < 0.60) return 'text-orange-400';
if (g < 0.75) return 'text-rose-400';
if (g < 0.90) return 'text-purple-400';
return 'text-blue-400';
```

---

## Section 7: Update MapTooltip (if applicable)

**File**: `frontend/src/components/map/MapTooltip.tsx`

If this file uses the same color logic (step-function altitude colors or flat green for maritime), update it to match the new gradient approach. If it only displays text, no changes needed.

Read the file first. Only modify color rendering logic if present.

---

## Section 8: Cleanup

1. **Delete** the old `TRIANGLE_ICON` constant (and `BOAT_ICON` if it exists). The canvas atlas replaces all SVG icon constants.
2. Remove any unused imports after refactoring.
3. Ensure `TrailPoint` is imported correctly everywhere it's used (the type changed from 3-tuple to 4-tuple).
4. Search for any remaining references to the old flat `[0, 255, 100, 220]` maritime color and replace with `entityColor()` or `speedToColor()` calls where appropriate.
5. Search for any remaining auto-packing `getIcon` calls that return objects (`{ url, width, height, mask }`). All icon layers should now use the pre-packed atlas with string keys.
6. Ensure the `prevCourseRef`, `prevSnapshotsRef`, `currSnapshotsRef` maps are cleaned up on mission change and entity stale-out as specified.

---

## Section 9: Build Verification

Run from `frontend/`:

```bash
npm run build
```

Fix any TypeScript errors. Common issues to watch for:
- `TrailPoint` is now a 4-tuple — anywhere that constructs `[lon, lat, alt]` needs `[lon, lat, alt, speed]`
- `PathLayer` `getColor` type — if per-vertex coloring fails, use the fallback approach from Section 5A
- Missing `as const` on string literals used as Deck.gl props

If the build succeeds, the implementation is complete.

---

## Summary of All Changes

| # | What | Where | Type |
|---|------|-------|------|
| 0 | Extend `TrailPoint` to 4-tuple (add speed) | `types.ts`, `TacticalMap.tsx` | Data |
| 1 | Add utility functions (`lerpAngle`, `smoothPath3D`, `altitudeToColor`, `speedToColor`, `entityColor`) | `TacticalMap.tsx` | Utilities |
| 2 | Canvas-drawn icon atlas: aircraft silhouette + ship hull (pre-packed, replaces SVG kite) | `TacticalMap.tsx` | Icon Atlas |
| 3 | Heading damping via `lerpAngle` + `prevCourseRef` | `TacticalMap.tsx` | Smoothing |
| 4 | Position interpolation via snapshot system | `TacticalMap.tsx` | Animation |
| 5 | Replace layer stack: all-entity trails, updated icons, glow, selection ring | `TacticalMap.tsx` | Rendering |
| 6 | Dynamic speed/altitude colors in sidebar | `SidebarRight.tsx` | UI |
| 7 | Update tooltip colors if applicable | `MapTooltip.tsx` | UI |
| 8 | Cleanup dead code and old color references | Multiple | Cleanup |
| 9 | Build verification | CLI | Validation |
