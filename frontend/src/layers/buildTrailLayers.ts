import type { Layer } from "@deck.gl/core";
import { LineLayer, PathLayer } from "@deck.gl/layers";
import { CoTEntity } from "../types";
import {
  altitudeToColor,
  entityColor,
  speedToColor,
} from "../utils/map/colorUtils";
import { getDistanceMeters } from "../utils/map/geoUtils";

type PathPoint3D = [number, number, number];
interface GapBridgeDatum {
  path: PathPoint3D[];
  entity: CoTEntity;
}
interface TrailPathDatum {
  path: PathPoint3D[];
}

const toPath3D = (points: number[][]): PathPoint3D[] =>
  points.map((pt) => [pt[0] ?? 0, pt[1] ?? 0, pt[2] ?? 0]);

// Per-trail-array conversion cache. Smoothed trails are regenerated only when
// an entity receives a server update (~1/s), while this builder runs on every
// animation frame for every visible entity — the WeakMap makes the frame cost
// a lookup instead of reallocating a path array per entity per frame.
const path3DCache = new WeakMap<number[][], PathPoint3D[]>();
const EMPTY_PATH: PathPoint3D[] = [];

const toPath3DCached = (points: number[][] | undefined): PathPoint3D[] => {
  if (!points || points.length === 0) return EMPTY_PATH;
  let path = path3DCache.get(points);
  if (!path) {
    path = toPath3D(points);
    path3DCache.set(points, path);
  }
  return path;
};

export function buildTrailLayers(
  interpolated: CoTEntity[],
  currentSelected: CoTEntity | null,
  globeMode: boolean | undefined,
  historyTailsEnabled: boolean,
): Layer[] {
  const layers: Layer[] = [];

  // 1. All History Trails (Global Toggle)
  // Filter out the selected entity's trail to avoid z-fighting/jaggedness
  if (historyTailsEnabled) {
    // Single pass: derive both the trail dataset and the gap-bridge dataset.
    const trailEntities: CoTEntity[] = [];
    const gapBridges: GapBridgeDatum[] = [];
    for (const d of interpolated) {
      if (currentSelected && d.uid === currentSelected.uid) continue;
      if (!d.trail || d.trail.length === 0) continue;

      if (d.trail.length >= 2) trailEntities.push(d);

      const last = d.trail[d.trail.length - 1];
      const dist = getDistanceMeters(last[1], last[0], d.lat, d.lon);
      if (dist > 5) {
        gapBridges.push({
          path: [
            [last[0], last[1], last[2]] as PathPoint3D,
            [d.lon, d.lat, d.altitude || 0] as PathPoint3D,
          ],
          entity: d,
        });
      }
    }

    layers.push(
      new PathLayer({
        id: `all-history-trails-${globeMode ? "globe" : "merc"}`,
        data: trailEntities,
        getPath: (d: CoTEntity) => toPath3DCached(d.smoothedTrail),
        getColor: (d: CoTEntity) => {
          const isShip = d.type.includes("S");
          return isShip
            ? speedToColor(d.speed, 180)
            : altitudeToColor(d.altitude, 180);
        },
        getWidth: 2.5,
        widthMinPixels: 1.5,
        pickable: false,
        jointRounded: true,
        capRounded: true,
        wrapLongitude: !globeMode,
        parameters: {
          depthTest: !!globeMode,
          depthBias: globeMode ? -50.0 : 0,
        },
      }),
    );

    // 1.5. Gap Bridge (Connects last history point to current interpolated position)
    layers.push(
      new PathLayer({
        id: `history-gap-bridge-${globeMode ? "globe" : "merc"}`,
        data: gapBridges,
        getPath: (d: GapBridgeDatum) => d.path,
        getColor: (d: GapBridgeDatum) => entityColor(d.entity, 180),
        getWidth: 3.5,
        widthMinPixels: 2.5,
        jointRounded: true,
        capRounded: true,
        pickable: false,
        wrapLongitude: !globeMode,
        parameters: {
          depthTest: !!globeMode,
          depthBias: globeMode ? -50.0 : 0,
        },
      }),
    );
  }

  // 2. Selected Entity Highlight Trail
  const selectedEntity = currentSelected
    ? interpolated.find((e) => e.uid === currentSelected.uid)
    : null;

  if (selectedEntity) {
    const entity = selectedEntity;
    if (entity.smoothedTrail && entity.smoothedTrail.length >= 2) {
      const trailPath = toPath3D(entity.smoothedTrail);

      const isShip = entity.type.includes("S");
      const trailColor = isShip
        ? speedToColor(entity.speed, 255)
        : altitudeToColor(entity.altitude, 255);

      layers.push(
        new PathLayer({
          id: `selected-trail-${entity.uid}-${globeMode ? "globe" : "merc"}`,
          data: [{ path: trailPath }],
          getPath: (d: TrailPathDatum) => d.path,
          getColor: trailColor,
          getWidth: 3.5,
          widthMinPixels: 2.5,
          pickable: false,
          jointRounded: true,
          capRounded: true,
          opacity: 1.0,
          wrapLongitude: !globeMode,
          parameters: {
            depthTest: !!globeMode,
            depthBias: globeMode ? -50.0 : 0,
          },
        }),
        // Gap bridge for selection
        new LineLayer({
          id: `selected-gap-bridge-${entity.uid}-${globeMode ? "globe" : "merc"}`,
          data: [entity],
          getSourcePosition: () => {
            const last = entity.trail![entity.trail!.length - 1];
            return [last[0], last[1], last[2]];
          },
          getTargetPosition: () => [
            entity.lon,
            entity.lat,
            entity.altitude || 0,
          ],
          getColor: trailColor,
          getWidth: 3.5,
          widthMinPixels: 2.5,
          pickable: false,
          wrapLongitude: !globeMode,
          parameters: {
            depthTest: !!globeMode,
            depthBias: globeMode ? -50.0 : 0,
          },
        }),
      );
    }
  }

  return layers;
}
