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

## Section 2: Distinct Maritime Icon

Add a second SVG icon constant right below the existing `TRIANGLE_ICON` (line 15). This is a diamond/hull shape that visually distinguishes boats from aircraft:

```typescript
// Maritime hull diamond icon
const BOAT_ICON = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2 L20 12 L12 22 L4 12 Z" fill="white" /></svg>')}`;
```

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

### 5B: Heading Icons (IconLayer) — Updated

Uses `entityColor()`, the new boat icon, heading from smoothed `entity.course`, and interpolated positions:

```typescript
    // 2. Heading Arrows (Primary Tactical Markers)
    new IconLayer({
        id: 'heading-arrows',
        data: interpolated,
        getIcon: (d: any) => ({
            url: d.type.includes('S') ? BOAT_ICON : TRIANGLE_ICON,
            width: 24,
            height: 24,
            anchorY: 12,
            mask: true
        }),
        getPosition: (d: any) => [d.lon, d.lat, d.altitude || 0],
        getSize: (d: any) => selectedEntity?.uid === d.uid ? 32 : 24,
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
            getIcon: [],
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

1. Remove any unused imports after refactoring.
2. Ensure `TrailPoint` is imported correctly everywhere it's used (the type changed from 3-tuple to 4-tuple).
3. Search for any remaining references to the old flat `[0, 255, 100, 220]` maritime color and replace with `entityColor()` or `speedToColor()` calls where appropriate.
4. Ensure the `prevCourseRef`, `prevSnapshotsRef`, `currSnapshotsRef` maps are cleaned up on mission change and entity stale-out as specified.

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
| 2 | Add distinct maritime diamond icon `BOAT_ICON` | `TacticalMap.tsx` | Icon |
| 3 | Heading damping via `lerpAngle` + `prevCourseRef` | `TacticalMap.tsx` | Smoothing |
| 4 | Position interpolation via snapshot system | `TacticalMap.tsx` | Animation |
| 5 | Replace layer stack: all-entity trails, updated icons, glow, selection ring | `TacticalMap.tsx` | Rendering |
| 6 | Dynamic speed/altitude colors in sidebar | `SidebarRight.tsx` | UI |
| 7 | Update tooltip colors if applicable | `MapTooltip.tsx` | UI |
| 8 | Cleanup dead code and old color references | Multiple | Cleanup |
| 9 | Build verification | CLI | Validation |
