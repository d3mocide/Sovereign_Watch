# Future Rendering Improvements

> Items identified during the Enhanced Flight & Maritime Rendering refactor that are valuable but belong in separate, focused efforts. Each has dependencies or scope that would bloat the current refactor.

---

## FE-10: Callsign Label Layer (TextLayer)

**Priority**: High
**Effort**: Medium
**Depends on**: Current refactor (interpolated positions, entity color system)

Currently, entities can only be identified by hovering to trigger the tooltip. Adding a `TextLayer` with callsign labels would dramatically improve situational awareness.

**Scope:**
- Render callsign labels for selected entity (always visible) and nearby entities within a pixel radius
- Declutter logic: suppress labels that overlap — either via deck.gl's `CollisionFilterExtension` or a simple spatial grid check
- Label positioning: offset below the icon (avoid occluding the aircraft/vessel silhouette)
- Style: small monospace text, same `entityColor()` tint but at reduced alpha, with a subtle dark text shadow for readability over both light and dark map tiles
- Consider a zoom-dependent density threshold — show more labels when zoomed in, fewer when zoomed out

**Why not now:** Declutter/collision avoidance is a feature in itself. Without it, labels at wide zoom overlap into unreadable noise. Getting it right requires its own iteration cycle.

---

## FE-11: Binary Attributes for Layer Data

**Priority**: High
**Effort**: Large
**Depends on**: Current refactor (stabilized layer structure)
**Note**: Already flagged as `FE-04` in existing code comments

The current animation loop rebuilds all layer data from `Array.from(entities.values())` every frame. At >5k entities this creates significant GC pressure.

**Scope:**
- Pre-allocate `Float32Array` buffers for positions, colors, sizes, angles
- Update individual indices when entities change rather than rebuilding the whole array
- Use deck.gl's binary attribute API (`data: { length, attributes: { getPosition: { value: float32Array, size: 3 } } }`)
- Maintain a free-list or compact-on-delete strategy for entity slot management
- Profile before/after with 10k+ synthetic entities

**Why not now:** This is a fundamental architectural change to how data flows from the entity Map to deck.gl layers. Requires careful benchmarking and a stable layer structure to optimize against (which this refactor provides).

---

## FE-12: Entity Clustering at High Zoom-Out

**Priority**: Medium
**Effort**: Medium
**Depends on**: FE-11 (binary attributes for performance at scale)

At wide zoom levels with thousands of entities, individual icons overlap into visual noise. Clustering would aggregate nearby entities into count badges.

**Scope:**
- Use deck.gl's `ClusterLayer` or integrate Supercluster for spatial indexing
- Cluster radius should be zoom-dependent (larger clusters at wider zoom)
- Cluster badges should show count and dominant entity type (air vs. sea)
- Clicking a cluster zooms to fit its bounds
- Smooth transition animation between clustered and unclustered states
- Clusters should use a neutral color; individual entities keep their altitude/speed tint

**Why not now:** Requires spatial indexing infrastructure and careful UX decisions about transition thresholds. Also benefits significantly from FE-11 (binary attributes) for the underlying data pipeline.

---

## FE-13: Stabilize RAF useEffect Dependencies

**Priority**: Medium
**Effort**: Small
**Depends on**: None (can be done independently)

The `requestAnimationFrame` animation loop `useEffect` depends on `[selectedEntity, onCountsUpdate, filters, onEvent]`. If any parent component doesn't memoize these props, the entire RAF loop tears down and restarts every render — causing frame drops and potential state loss.

**Scope:**
- Move `selectedEntity`, `filters`, `onCountsUpdate`, and `onEvent` into refs that are updated via separate effects
- Make the RAF `useEffect` depend only on `[]` (mount/unmount)
- The animation callback reads from refs, so it always has the latest values without causing effect re-runs
- Pattern:
  ```typescript
  const selectedEntityRef = useRef(selectedEntity);
  useEffect(() => { selectedEntityRef.current = selectedEntity; }, [selectedEntity]);
  // ... same for filters, onCountsUpdate, onEvent
  ```
- This is the standard React pattern for stable animation loops

**Why not now:** This is a component architecture improvement, not a rendering feature. The current behavior is functional (just wasteful). Fits better as a standalone cleanup PR.
