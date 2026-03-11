import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";

type AotShapes = { maritime: number[][]; aviation: number[][] };
type Filters = { showSea?: boolean; showAir?: boolean;[key: string]: boolean | undefined };

/** Generate a geodesic circle polygon with `segments` vertices. */
function geodesicCircle(lat: number, lon: number, radiusKm: number, segments = 128): number[][] {
  const R = 6371;
  const points: number[][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const dLat = (radiusKm / R) * (180 / Math.PI) * Math.cos(angle);
    const dLon = (radiusKm / R) * (180 / Math.PI) * Math.sin(angle) / Math.cos((lat * Math.PI) / 180);
    points.push([lon + dLon, lat + dLat, 0]);
  }
  return points;
}

export function buildAOTLayers(
  aotShapes: AotShapes | null,
  filters: Filters | undefined,
  globeMode: boolean | undefined,
  observer?: { lat: number; lon: number; radiusKm: number } | null,
  rfBoundary?: { lat: number; lon: number; radiusKm: number } | null,
): any[] {
  const layers: any[] = [];

  if (aotShapes && filters?.showSea !== false && aotShapes.maritime.length > 0) {
    layers.push(
      new PathLayer({
        id: `aot-maritime-${globeMode ? "globe" : "merc"}`,
        data: [{ path: aotShapes.maritime.map((p) => [p[0], p[1], 0]) }],
        getPath: (d: any) => d.path,
        getColor: [0, 191, 255, 150], // #00BFFF at ~60% opacity
        getWidth: 2.5,
        widthMinPixels: 2,
        pickable: false,
        jointRounded: true,
        capRounded: true,
        wrapLongitude: !globeMode,
        billboard: !!globeMode,
        parameters: { depthTest: !!globeMode, depthBias: globeMode ? -100.0 : 0 },
      }),
    );
  }

  if (aotShapes && filters?.showAir !== false && aotShapes.aviation.length > 0) {
    layers.push(
      new PathLayer({
        id: `aot-aviation-${globeMode ? "globe" : "merc"}`,
        data: [{ path: aotShapes.aviation.map((p) => [p[0], p[1], 0]) }],
        getPath: (d: any) => d.path,
        getColor: [0, 255, 100, 150], // #00FF64 at ~60% opacity
        getWidth: 2.5,
        widthMinPixels: 2,
        pickable: false,
        jointRounded: true,
        capRounded: true,
        wrapLongitude: !globeMode,
        billboard: !!globeMode,
        parameters: { depthTest: !!globeMode, depthBias: globeMode ? -100.0 : 0 },
      }),
    );
  }

  // Orbital observer horizon ring — shows the area used for pass prediction
  if (observer) {
    const ringPath = geodesicCircle(observer.lat, observer.lon, observer.radiusKm);
    layers.push(
      // Filled translucent disc
      new PathLayer({
        id: `aot-orbital-horizon-${globeMode ? 'globe' : 'merc'}`,
        data: [{ path: ringPath }],
        getPath: (d: any) => d.path,
        getColor: [160, 100, 255, 90],  // soft purple at ~35% opacity
        getWidth: 2,
        widthMinPixels: 1.5,
        pickable: false,
        jointRounded: true,
        capRounded: true,
        wrapLongitude: !globeMode,
        billboard: !!globeMode,
        parameters: { depthTest: !!globeMode, depthBias: globeMode ? -100.0 : 0 },
        getDashArray: [8, 4],
      }),
    );
    // Observer location dot
    layers.push(
      new ScatterplotLayer({
        id: `aot-orbital-observer-${globeMode ? 'globe' : 'merc'}`,
        data: [{ position: [observer.lon, observer.lat, 0] }],
        getPosition: (d: any) => d.position,
        getFillColor: [160, 100, 255, 200],
        getRadius: 6000,  // ~6km dot radius
        radiusMinPixels: 4,
        radiusMaxPixels: 10,
        pickable: false,
        parameters: { depthTest: false },
      }),
    );
  }

  // RF Survey horizon ring
  if (rfBoundary && filters?.showRepeaters !== false) {
    const ringPath = geodesicCircle(rfBoundary.lat, rfBoundary.lon, rfBoundary.radiusKm);
    layers.push(
      new PathLayer({
        id: `aot-rf-horizon-${globeMode ? 'globe' : 'merc'}`,
        data: [{ path: ringPath }],
        getPath: (d: any) => d.path,
        getColor: [251, 191, 36, 90],  // amber-400 at ~35% opacity
        getWidth: 2,
        widthMinPixels: 1.5,
        pickable: false,
        jointRounded: true,
        capRounded: true,
        wrapLongitude: !globeMode,
        billboard: !!globeMode,
        parameters: { depthTest: !!globeMode, depthBias: globeMode ? -100.0 : 0 },
        getDashArray: [4, 4],
      }),
    );
  }

  return layers;
}
