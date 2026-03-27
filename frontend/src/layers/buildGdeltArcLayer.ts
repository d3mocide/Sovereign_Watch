import type { Layer } from "@deck.gl/core";
import { ArcLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";

export interface GdeltArc {
  sourcePosition: [number, number];
  targetPosition: [number, number];
  sourceColor: [number, number, number, number];
  targetColor: [number, number, number, number];
  width: number;
  event_id: string;
}

interface GdeltArcPath {
  path: [number, number, number][];
  sourceColor: [number, number, number, number];
  targetColor: [number, number, number, number];
  width: number;
  event_id: string;
}

interface GdeltArcSegment {
  path: [number, number, number][];
  color: [number, number, number, number];
  width: number;
}

interface GdeltArcEndpoint {
  position: [number, number, number];
  color: [number, number, number, number];
  isTarget: boolean;
}

/** Centroid lookup keyed by ISO 3166-1 alpha-3 / CAMEO country code. */
export type CentroidMap = Record<string, [number, number]>;

let centroidsCache: CentroidMap | null = null;
let centroidsFetchPromise: Promise<CentroidMap> | null = null;

/** Returns cached centroids (empty object if not yet loaded). */
export function getCentroidsCache(): CentroidMap {
  return centroidsCache ?? {};
}

/**
 * Fetch and cache country centroids from the public static asset.
 * Returns empty object on failure so arcs degrade gracefully.
 */
async function loadCentroids(): Promise<CentroidMap> {
  if (centroidsCache) return centroidsCache;
  if (centroidsFetchPromise) return centroidsFetchPromise;

  centroidsFetchPromise = fetch("/country_centroids.json")
    .then((r) => r.json())
    .then((data: CentroidMap) => {
      centroidsCache = data;
      return data;
    })
    .catch(() => {
      centroidsCache = {};
      return {} as CentroidMap;
    });

  return centroidsFetchPromise;
}

// Kick off the fetch immediately so centroids are ready before first render.
loadCentroids();

/**
 * Resolve an ISO-3 / CAMEO country code string to [lat, lon].
 * Returns null when the code is absent or unknown.
 */
function resolveCentroid(
  code: string | undefined | null,
  centroids: CentroidMap,
): [number, number] | null {
  if (!code) return null;
  const norm = code.trim().toUpperCase();
  const entry = centroids[norm];
  return entry ?? null;
}

/**
 * Build arc data from GDELT events where both actor countries are resolvable
 * to geographic centroids.  Falls back to a deterministic fan-spread when
 * actor2_country is missing, so arcs are never completely empty on cold load.
 */
export function buildArcData(
  gdeltData: {
    type: string;
    features: Array<{
      id?: string;
      geometry: { coordinates: [number, number] };
      properties: {
        event_id?: string;
        goldstein?: number;
        num_mentions?: number;
        actor1_country?: string;
        actor2_country?: string;
        quad_class?: number;
      };
    }>;
  } | null,
  centroids: CentroidMap,
): GdeltArc[] {
  if (!gdeltData?.features?.length) return [];

  // Draw arcs for conflict-class events (quad_class 3/4) by default.
  const conflictFeatures = gdeltData.features.filter(
    (f) => (f.properties.quad_class ?? 0) >= 3,
  );

  return conflictFeatures.reduce<GdeltArc[]>((acc, f, i) => {
    const [evtLon, evtLat] = f.geometry.coordinates;
    if (!evtLon || !evtLat) return acc;

    const goldstein = f.properties.goldstein ?? 0;
    const mentions = f.properties.num_mentions ?? 1;

    // Source: resolve actor1 country centroid.
    // Fall back to the event's own coordinates (which approximate actor1 location).
    const actor1Centroid = resolveCentroid(
      f.properties.actor1_country,
      centroids,
    );
    const srcLat = actor1Centroid ? actor1Centroid[0] : evtLat;
    const srcLon = actor1Centroid ? actor1Centroid[1] : evtLon;

    // Target: resolve actor2 country centroid.
    let tgtLat: number;
    let tgtLon: number;
    const actor2Centroid = resolveCentroid(
      f.properties.actor2_country,
      centroids,
    );
    if (actor2Centroid) {
      tgtLat = actor2Centroid[0];
      tgtLon = actor2Centroid[1];
    } else {
      // Deterministic angular fallback — golden-angle fan spread
      const angle = ((i * 115.508) % 360) * (Math.PI / 180);
      const dist = 10 + (Math.abs(goldstein) / 10) * 20;
      tgtLon = srcLon + Math.cos(angle) * dist;
      tgtLat = Math.max(
        -85,
        Math.min(85, srcLat + Math.sin(angle) * dist * 0.5),
      );
    }

    // Skip self-loops (source === target within ~1°)
    if (Math.abs(srcLat - tgtLat) < 1 && Math.abs(srcLon - tgtLon) < 1)
      return acc;

    // Source colour encodes conflict severity.
    const sourceAlpha = goldstein <= -5 ? 210 : 170;
    const sourceColor: [number, number, number, number] =
      goldstein <= -5
        ? [255, 50, 50, sourceAlpha] // vivid red
        : [255, 140, 0, sourceAlpha]; // vivid orange

    // Target: sovereign cyan.
    const targetColor: [number, number, number, number] = [0, 255, 230, 130];

    // Arc width scales with media attention — boosted for better 3D 'tube' presence.
    const width = Math.min(6, Math.max(2.0, Math.log2(mentions + 1) * 1.2));

    acc.push({
      event_id: f.properties.event_id || f.id || `arc-${i}`,
      sourcePosition: [srcLon, srcLat],
      targetPosition: [tgtLon, tgtLat],
      sourceColor,
      targetColor,
      width,
    });
    return acc;
  }, []);
}

/**
 * Builds an ArcLayer of sovereign-glass projection beams for GDELT conflict events.
 *
 * Arcs connect actor1 country centroid → actor2 country centroid using the
 * country_centroids.json static lookup.  The layer degrades gracefully:
 *   - If centroids haven't loaded yet, arcs fan out from a deterministic fallback.
 *   - If actor2_country is absent, same deterministic fallback applies.
 *
 * Visual encoding:
 *   Source:  red (material conflict) or orange (verbal conflict)
 *   Target:  sovereign cyan (#00DCC8)
 *   Height:  0.3 — curves visibly over the globe surface
 *   Width:   1–4 px scaled to num_mentions
 *   Opacity: pulse-animated via animTick
 */
// OPTIMIZATION: Cache arc data based on gdeltData object reference to prevent
// re-running buildArcData (a large reduce loop) every frame during animation.
const arcDataCache = new WeakMap<any, GdeltArc[]>();

function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function lonLatToUnitVec(lon: number, lat: number): [number, number, number] {
  const lonRad = (lon * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  return [
    cosLat * Math.cos(lonRad),
    cosLat * Math.sin(lonRad),
    Math.sin(latRad),
  ];
}

function unitVecToLonLat(v: [number, number, number]): [number, number] {
  const [x, y, z] = v;
  const lon = wrapLon((Math.atan2(y, x) * 180) / Math.PI);
  const lat = (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI;
  return [lon, lat];
}

function normalizeVec(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function crossVec(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function rotateAroundAxis(
  v: [number, number, number],
  axis: [number, number, number],
  angleRad: number,
): [number, number, number] {
  // Rodrigues' rotation formula
  const k = normalizeVec(axis);
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const dotKV = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const kxv = crossVec(k, v);

  return [
    v[0] * cosA + kxv[0] * sinA + k[0] * dotKV * (1 - cosA),
    v[1] * cosA + kxv[1] * sinA + k[1] * dotKV * (1 - cosA),
    v[2] * cosA + kxv[2] * sinA + k[2] * dotKV * (1 - cosA),
  ];
}

function slerpUnitVec(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const dot = Math.max(
    -1,
    Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]),
  );
  const omega = Math.acos(dot);

  // For very close points, fall back to normalized lerp to avoid precision issues.
  if (omega < 1e-5) {
    return normalizeVec([
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ]);
  }

  const sinOmega = Math.sin(omega);
  const wA = Math.sin((1 - t) * omega) / sinOmega;
  const wB = Math.sin(t * omega) / sinOmega;
  return [a[0] * wA + b[0] * wB, a[1] * wA + b[1] * wB, a[2] * wA + b[2] * wB];
}

function centralAngleRad(
  source: [number, number],
  target: [number, number],
): number {
  const a = lonLatToUnitVec(source[0], source[1]);
  const b = lonLatToUnitVec(target[0], target[1]);
  const dot = Math.max(
    -1,
    Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]),
  );
  return Math.acos(dot);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function hash01(input: string): number {
  // FNV-1a style hash for deterministic per-arc jitter.
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function jitterLonLat(
  pos: [number, number],
  seed: number,
  radiusMeters: number,
): [number, number] {
  if (radiusMeters <= 0) return pos;

  const theta = seed * Math.PI * 2;
  const dNorthMeters = Math.sin(theta) * radiusMeters;
  const dEastMeters = Math.cos(theta) * radiusMeters;

  const lat = pos[1];
  const latRad = (lat * Math.PI) / 180;
  const cosLat = Math.max(0.15, Math.cos(latRad));

  const dLat = dNorthMeters / 111320;
  const dLon = dEastMeters / (111320 * cosLat);

  return [wrapLon(pos[0] + dLon), Math.max(-85, Math.min(85, pos[1] + dLat))];
}

function buildArcPath3D(
  source: [number, number],
  target: [number, number],
  baseMeters: number,
  peakMeters: number,
  segments: number,
  liftPower: number,
  sideGainRad: number,
  sideSign: number,
): [number, number, number][] {
  const [srcLon, srcLat] = source;
  const [tgtLon, tgtLat] = target;

  const srcVec = lonLatToUnitVec(srcLon, srcLat);
  const tgtVec = lonLatToUnitVec(tgtLon, tgtLat);
  const planeNormal = normalizeVec(crossVec(srcVec, tgtVec));

  const points: [number, number, number][] = [];
  const steps = Math.max(8, segments);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // Interpolate on the unit sphere so the path follows a true great-circle route.
    let p = slerpUnitVec(srcVec, tgtVec, t);

    // Horizontal gain: bend sideways around the globe (orthogonal to geodesic)
    // while preserving endpoints (sin(pi*t) = 0 at t=0 and t=1).
    const sideProfile = Math.pow(Math.sin(Math.PI * t), 0.95);
    const sideAngle = sideGainRad * sideProfile * sideSign;
    if (Math.abs(sideAngle) > 1e-6) {
      const tangent = crossVec(planeNormal, p);
      const tangentLen = Math.hypot(tangent[0], tangent[1], tangent[2]);
      if (tangentLen > 1e-8) {
        p = normalizeVec(rotateAroundAxis(p, tangent, sideAngle));
      }
    }

    const [lon, lat] = unitVecToLonLat(p);

    // Endpoints should touch the map surface (alt=0), while the middle of the
    // route still rises into 3D.
    const lift = Math.pow(Math.sin(Math.PI * t), liftPower);
    const endpointBlend = Math.pow(Math.sin(Math.PI * t), 0.55);
    const alt = (baseMeters + peakMeters * lift) * endpointBlend;
    points.push([lon, lat, alt]);
  }

  return points;
}

export function buildGdeltArcLayer(
  gdeltData: { type: string; features: any[] } | null,
  visible: boolean,
  globeMode: boolean,
  animTick: number,
): Layer[] {
  if (!visible || !gdeltData?.features?.length) return [];

  // Use cached data if available for this specific data object.
  let data = arcDataCache.get(gdeltData);
  if (!data) {
    const centroids = centroidsCache ?? {};
    data = buildArcData(gdeltData as any, centroids);
    arcDataCache.set(gdeltData, data);
  }

  if (!data || !data.length) return [];

  // Pulse amplified for better visual depth
  const pulsePhase = 0.5 + 0.5 * Math.sin(animTick * Math.PI * 2 * 0.45);
  const pulseEase = pulsePhase * pulsePhase * (3 - 2 * pulsePhase);
  const pulse = 0.72 + 0.28 * pulseEase; // 28% amplitude

  if (globeMode) {
    const pathData: GdeltArcPath[] = data.map((d) => {
      // De-stack dense hub fans with deterministic per-arc endpoint jitter.
      const seedA = hash01(d.event_id || "gdelt-arc");
      const seedB = (seedA * 1.61803398875) % 1;
      const src = jitterLonLat(d.sourcePosition, seedA, 16_000);
      const tgt = jitterLonLat(d.targetPosition, seedB, 6_000);

      const angle = centralAngleRad(src, tgt);
      const distanceNorm = clamp01(angle / Math.PI);

      // Dynamic scaling for long-haul links (e.g., US <-> Middle East).
      // Altitude reduced after user feedback (prev levels were 'toooooo much').
      const baseMeters = lerp(180_000, 480_000, Math.pow(distanceNorm, 1.0));
      const peakMetersRaw = lerp(
        700_000,
        2_400_000,
        Math.pow(distanceNorm, 1.25),
      );

      // Clamp medium/long routes to a minimum apex so they don't sag into the globe.
      const mediumLongNorm = clamp01((distanceNorm - 0.3) / 0.7);
      const minPeakMeters = lerp(500_000, 1_600_000, mediumLongNorm);
      const peakMeters = Math.max(peakMetersRaw, minPeakMeters);

      // Tighter segment density to optimize performance and reduce beading artifacts.
      const segments = Math.round(lerp(38, 92, Math.pow(distanceNorm, 1.15)));

      // Lower power keeps long-haul arcs high for a larger fraction of the route.
      const liftPower = lerp(1.18, 0.82, distanceNorm);

      // Horizontal gain (lateral spherical bend): stronger for longer routes.
      const sideGainDeg = lerp(1.2, 8.0, Math.pow(distanceNorm, 1.1));
      const sideGainRad = (sideGainDeg * Math.PI) / 180;
      const sideSign = seedA > 0.5 ? 1 : -1;

      const color = d.sourceColor;
      return {
        event_id: d.event_id,
        width: d.width,
        sourceColor: [
          color[0],
          color[1],
          color[2],
          Math.round(color[3] * pulse),
        ],
        targetColor: [
          d.targetColor[0],
          d.targetColor[1],
          d.targetColor[2],
          Math.round(d.targetColor[3] * pulse),
        ],
        path: buildArcPath3D(
          src,
          tgt,
          baseMeters,
          peakMeters,
          segments,
          liftPower,
          sideGainRad,
          sideSign,
        ),
      };
    });

    // Split each arc into tiny path segments for source->target gradient.
    const segmentData: GdeltArcSegment[] = pathData.flatMap((arc) => {
      const pts = arc.path;
      if (pts.length < 2) return [];

      const segs: GdeltArcSegment[] = [];
      const total = pts.length - 1;

      for (let i = 0; i < total; i++) {
        const t = (i + 0.5) / total;
        const r = Math.round(
          arc.sourceColor[0] * (1 - t) + arc.targetColor[0] * t,
        );
        const g = Math.round(
          arc.sourceColor[1] * (1 - t) + arc.targetColor[1] * t,
        );
        const b = Math.round(
          arc.sourceColor[2] * (1 - t) + arc.targetColor[2] * t,
        );
        const aSrc = arc.sourceColor[3];
        const aTgt = arc.targetColor[3];
        const a = Math.round((aSrc * (1 - t) + aTgt * t) * (0.68 + 0.28 * t));
        const width = arc.width * (0.92 - 0.22 * t);

        segs.push({
          path: [pts[i], pts[i + 1]],
          color: [r, g, b, a],
          width,
        });
      }

      return segs;
    });

    const endpointData: GdeltArcEndpoint[] = pathData.flatMap((arc) => {
      if (arc.path.length < 2) return [];
      return [
        {
          position: arc.path[0],
          color: arc.sourceColor,
          isTarget: false,
        },
        {
          position: arc.path[arc.path.length - 1],
          color: arc.targetColor,
          isTarget: true,
        },
      ];
    });

    return [
      // 1. Ambient Shadow Shell — provides soft volume/halo and depth context
      new PathLayer<GdeltArcSegment>({
        id: "gdelt-arcs-3d-globe-shadow",
        data: segmentData,
        pickable: false,
        getPath: (d) => d.path,
        getColor: (d) => [0, 0, 0, Math.round(d.color[3] * 0.35)],
        getWidth: (d) => d.width * 2.8,
        widthUnits: "pixels",
        widthMinPixels: 4.5,
        jointRounded: false,
        capRounded: false,
        updateTriggers: {
          getColor: animTick,
        },
        parameters: {
          depthTest: true,
          depthBias: -20.0, // Furthest back of the tube stack
        } as any,
      }),
      // 2. Structural Shell — provides the dark 'underside' of the tube
      new PathLayer<GdeltArcSegment>({
        id: "gdelt-arcs-3d-globe-shell",
        data: segmentData,
        pickable: false,
        getPath: (d) => d.path,
        getColor: (d) => [
          Math.max(0, Math.round(d.color[0] * 0.4)),
          Math.max(0, Math.round(d.color[1] * 0.4)),
          Math.max(0, Math.round(d.color[2] * 0.4)),
          Math.round(d.color[3] * 0.85),
        ],
        getWidth: (d) => d.width * 1.8,
        widthUnits: "pixels",
        widthMinPixels: 3.5,
        jointRounded: false,
        capRounded: false,
        updateTriggers: {
          getColor: animTick,
        },
        parameters: {
          depthTest: true,
          depthBias: -22.0,
        } as any,
      }),
      // 3. Main Data Core — the visible surface of the tube
      new PathLayer<GdeltArcSegment>({
        id: "gdelt-arcs-3d-globe-core",
        data: segmentData,
        pickable: false,
        getPath: (d) => d.path,
        getColor: (d) => d.color,
        getWidth: (d) => d.width,
        widthUnits: "pixels",
        widthMinPixels: 2.0,
        jointRounded: false,
        capRounded: false,
        updateTriggers: {
          getColor: animTick,
        },
        parameters: {
          depthTest: true,
          depthBias: -24.0,
        } as any,
      }),
      // 4. Volumetric Highlight — simulating a specular sheen on a rounded surface
      new PathLayer<GdeltArcSegment>({
        id: "gdelt-arcs-3d-globe-highlight",
        data: segmentData,
        pickable: false,
        getPath: (d) => d.path,
        getColor: (d) => [
          Math.min(255, Math.round(d.color[0] * 1.25 + 24)),
          Math.min(255, Math.round(d.color[1] * 1.25 + 24)),
          Math.min(255, Math.round(d.color[2] * 1.25 + 24)),
          Math.round(d.color[3] * 0.72),
        ],
        getWidth: (d) => d.width * 0.5,
        widthUnits: "pixels",
        widthMinPixels: 1.2,
        jointRounded: false,
        capRounded: false,
        updateTriggers: {
          getColor: animTick,
        },
        parameters: {
          depthTest: true,
          depthBias: -26.0,
        } as any,
      }),
      // 5. Specular Ridge — the sharp vertex highlight to give it 'hard' depth
      new PathLayer<GdeltArcSegment>({
        id: "gdelt-arcs-3d-globe-specular",
        data: segmentData,
        pickable: false,
        getPath: (d) => d.path,
        getColor: (d) => [255, 255, 255, Math.round(d.color[3] * 0.85)],
        getWidth: (d) => d.width * 0.18,
        widthUnits: "pixels",
        widthMinPixels: 0.65,
        jointRounded: false,
        capRounded: false,
        updateTriggers: {
          getColor: animTick,
        },
        parameters: {
          depthTest: true,
          depthBias: -28.0, // Topmost highlight
        } as any,
      }),
      new ScatterplotLayer<GdeltArcEndpoint>({
        id: "gdelt-arc-endpoints-globe",
        data: endpointData,
        pickable: false,
        stroked: true,
        filled: true,
        getPosition: (d) => d.position,
        getRadius: (d) => (d.isTarget ? 52_000 : 32_000),
        radiusUnits: "meters",
        getFillColor: (d) => d.color,
        getLineColor: (d) =>
          d.isTarget ? [255, 255, 255, 165] : [0, 0, 0, 80],
        getLineWidth: (d) => (d.isTarget ? 1.5 : 1),
        lineWidthUnits: "pixels",
        parameters: {
          depthTest: true,
          depthBias: 20.0,
        } as any,
      }),
    ];
  }

  return [
    new ArcLayer<GdeltArc>({
      id: `gdelt-arcs-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: false,
      getSourcePosition: (d) => d.sourcePosition,
      getTargetPosition: (d) => d.targetPosition,
      getSourceColor: (d) => {
        const c = d.sourceColor;
        return [c[0], c[1], c[2], Math.round(c[3] * pulse)];
      },
      getTargetColor: (d) => {
        const c = d.targetColor;
        return [c[0], c[1], c[2], Math.round(c[3] * pulse)];
      },
      getWidth: (d) => d.width,
      getHeight: 0.3,
      widthUnits: "pixels",
      wrapLongitude: !globeMode,
      updateTriggers: {
        getSourceColor: animTick,
        getTargetColor: animTick,
      },
      parameters: {
        depthTest: !!globeMode,
        depthBias: globeMode ? -150.0 : 0,
      } as any,
    }),
  ];
}
