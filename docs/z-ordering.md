# Sovereign Watch — Tactical Layer Z-Ordering Reference

**Last Updated:** 2026-02-21
**Applies To:** `TacticalMap.tsx`, `OrbitalLayer.tsx`

---

## Overview

All tactical and orbital deck.gl layers use WebGL `depthBias` to enforce a strict render order.

> **Convention: More negative `depthBias` = closer to viewer = renders ON TOP.**
> A positive or less-negative value means the layer renders behind more-negative layers.

Layers with the same `depthBias` fall back to their array order in the `layers` array (later = on top).

> **Architecture Note:** The map adapters use `interleaved: false`, giving deck.gl its own dedicated WebGL canvas with MSAA-quality anti-aliasing. The `depthBias` values are relative within deck.gl's own depth buffer — not the MapLibre/Mapbox base map.

---

## Full Depth Matrix (Top → Bottom)

|  Priority   | `depthBias` | Layer ID                    | File               | Notes                                             |
| :---------: | :---------: | :-------------------------- | :----------------- | :------------------------------------------------ |
|   1 (top)   |  `-220.0`   | `velocity-vectors`          | `TacticalMap.tsx`  | Velocity & prediction lines — always topmost      |
|      2      |  `-215.0`   | `selection-ring`            | `TacticalMap.tsx`  | Pulsing selection ring around selected CoT entity |
|      3      |  `-212.0`   | `entity-glow`               | `TacticalMap.tsx`  | Scatter glow for selected entity                  |
|      4      |  `-210.0`   | `heading-arrows`            | `TacticalMap.tsx`  | Primary CoT entity chevron icons                  |
|      5      |  `-209.0`   | `entity-tactical-halo`      | `TacticalMap.tsx`  | Amber halo — just behind icon, ahead of ring      |
|      6      |  `-220.0`   | `satellite-markers`         | `OrbitalLayer.tsx` | Sat marker icons (same tier as velocity vectors)  |
|      7      |  `-201.0`   | `satellite-selection-ring`  | `OrbitalLayer.tsx` | Animated selection ring for selected satellite    |
|      8      |  `-101.0`   | `selected-trail-{uid}`      | `TacticalMap.tsx`  | Highlighted trail for selected CoT entity         |
|      9      |  `-101.0`   | `selected-gap-bridge-{uid}` | `TacticalMap.tsx`  | Gap bridge for selected entity trail              |
|     10      |  `-100.0`   | `all-history-trails`        | `TacticalMap.tsx`  | Historical trails for all unselected entities     |
|     11      |  `-100.0`   | `history-gap-bridge`        | `TacticalMap.tsx`  | Gap bridge connecting trail tail to live position |
|     12      |  `-100.0`   | `altitude-stems`            | `TacticalMap.tsx`  | Vertical lines from entity to ground              |
|     13      |   `-50.0`   | `satellite-ground-track`    | `OrbitalLayer.tsx` | Orbital path trace — behind CoT trails and icons  |
|     14      |    `0.0`    | `satellite-ground-dot`      | `OrbitalLayer.tsx` | Ground projection of satellite — nearly flat      |
| 15 (bottom) |   `+50.0`   | `satellite-footprint`       | `OrbitalLayer.tsx` | Coverage circle — deepest, pushed furthest back   |

> **Note on CoT ground-dots:** The `ground-dots` ScatterplotLayer in TacticalMap.tsx uses `depthBias: -300.0` — this is further back than CoT icons but is a known value that may need review if it fights with orbital footprints.

---

## Rules & Invariants

1. **`depthBias` more negative = on top.** Always. A layer with `depthBias: -210.0` is in front of one with `depthBias: -50.0`.
2. **Orbital below CoT:** All orbital background layers (ground track, footprint, ground dot) must have a `depthBias` **less negative** than `-101.0` (the CoT trail level). They should never occlude CoT entities.
3. **Satellite markers are the exception:** Sat markers at `-220.0` share the top tier as they are actual objects in 3D space at unique altitudes unlikely to overlap CoT icons in screen space.
4. **Icon above halo:** Primary icon (`-210.0`) must be more negative than halo (`-209.0`) by at least `1.0`.
5. **Selection ring above icon:** Selection ring (`-215.0`) must be more negative than icon (`-210.0`).
6. **Trails below icons:** All trail layers must be no more negative than `-101.0`.
7. **Do not use `depthBias: 0` for CoT trails:** Without sufficient bias, CoT trail layers fight with map terrain geometry.

---

## Rendering Mode

| Setting       | Value   | Effect                                           |
| :------------ | :------ | :----------------------------------------------- |
| `interleaved` | `false` | deck.gl uses its own dedicated WebGL canvas      |
| `antialias`   | `true`  | MSAA enabled at canvas creation for smooth lines |
| `depthTest`   | `true`  | All layers participate in depth testing          |

> Changing `interleaved` to `true` causes deck.gl to render inside the map's WebGL context, losing MSAA and potentially causing z-ordering conflicts with map terrain.

---

## Source Files

- [`TacticalMap.tsx`](file:///d:/Projects/SovereignWatch/frontend/src/components/map/TacticalMap.tsx) — CoT entity layers
- [`OrbitalLayer.tsx`](file:///d:/Projects/SovereignWatch/frontend/src/layers/OrbitalLayer.tsx) — Satellite layers
- [`MapLibreAdapter.tsx`](file:///d:/Projects/SovereignWatch/frontend/src/components/map/MapLibreAdapter.tsx) — MapLibre canvas config
- [`MapboxAdapter.tsx`](file:///d:/Projects/SovereignWatch/frontend/src/components/map/MapboxAdapter.tsx) — Mapbox canvas config
