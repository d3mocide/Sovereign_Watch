# Global Situation Globe — Terminator Line Rendering Bug

## Issue

On the dashboard's Global Situation view (`SituationGlobe`), the night-side
terminator overlay rendered as a jagged, misplaced patch near the pole
instead of a smooth shadow across the night hemisphere. The same
`getTerminatorLayer()` geometry renders correctly on the flat 2D maps
(`TacticalMap`, `OrbitalMap`).

Root cause: `computeTerminator()` builds the night-side polygon by sampling
the wavy terminator curve at 1° longitude steps, then closing the ring by
jumping straight from the curve to the pole with only two vertices
(`coords.push([180, ±90])`, `coords.push([-180, ±90])`). On a flat/Mercator
projection a single long edge is harmless — it just renders as a straight
vertical line. On the globe (MapLibre's native globe projection, which bends
existing vertices onto the sphere but interpolates *linearly between* them),
that same edge — which can span 100+ degrees of latitude in one hop — becomes
a straight 3D chord cutting across the visible sphere instead of following
its curvature, producing the stray wedge seen near the pole while most of
the actual night region went unrendered.

## Solution

Densify the two pole-closing edges the same way the terminator curve itself
is already densified: step along the fixed-longitude meridian (lon = ±180)
from the curve to the pole in ~2° latitude increments instead of a single
jump. The pole-to-pole edge (`lon=180` → `lon=-180`, both at the same pole
latitude) is left as a single edge — it's a true zero-length edge in 3D since
every longitude maps to the same point at the pole, so no subdivision is
needed there. This changes only the number of vertices along an already
straight line in flat projections (no visual change on the working 2D maps)
while giving the globe projection enough points to hug the sphere's surface.

## Changes

- `frontend/src/components/map/TerminatorLayer.tsx` — `computeTerminator()`
  replaces the two-point pole closure with a stepped ramp (`LAT_STEP_DEG =
  2`) along each boundary meridian, symmetric on both sides so the
  pole-to-pole edge still lands on the exact same 3D point at both ends.
- `frontend/src/components/map/TerminatorLayer.test.ts` (new) — regression
  test asserting no edge of the generated night polygon exceeds a 5° lat/lon
  step, except the expected zero-length pole-to-pole edge.

## Verification

- `pnpm run lint` — clean (0 warnings).
- `pnpm run typecheck` — clean.
- `pnpm run test` — 279/279 passed (278 existing + 1 new).

## Benefits

- The night-side overlay on the Global Situation globe now follows the
  sphere's curvature correctly instead of showing a stray artifact near the
  pole, matching the correct behavior already present on the flat map views.
- The regression test catches any future reintroduction of long,
  undersampled edges in the terminator polygon before it reaches the globe
  renderer.
