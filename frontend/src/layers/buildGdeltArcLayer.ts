import type { Layer } from "@deck.gl/core";
import { ArcLayer } from "@deck.gl/layers";

export interface GdeltArc {
  sourcePosition: [number, number];
  targetPosition: [number, number];
  sourceColor: [number, number, number, number];
  targetColor: [number, number, number, number];
  width: number;
  event_id: string;
}

/** Centroid lookup keyed by ISO 3166-1 alpha-3 / CAMEO country code. */
type CentroidMap = Record<string, [number, number]>;

let centroidsCache: CentroidMap | null = null;
let centroidsFetchPromise: Promise<CentroidMap> | null = null;

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
function buildArcData(
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
  debugMode?: boolean,
): GdeltArc[] {
  if (!gdeltData?.features?.length) return [];

  // Draw arcs for conflict-class events (quad_class 3/4) by default,
  // but show ALL arcs in debugMode to verify data presence.
  const conflictFeatures = gdeltData.features.filter(
    (f) => debugMode || (f.properties.quad_class ?? 0) >= 3,
  );

  return conflictFeatures.reduce<GdeltArc[]>((acc, f, i) => {
    const [evtLon, evtLat] = f.geometry.coordinates;
    if (!evtLon || !evtLat) return acc;

    const goldstein = f.properties.goldstein ?? 0;
    const mentions = f.properties.num_mentions ?? 1;

    // Source: resolve actor1 country centroid.
    // Fall back to the event's own coordinates (which approximate actor1 location).
    const actor1Centroid = resolveCentroid(f.properties.actor1_country, centroids);
    const srcLat = actor1Centroid ? actor1Centroid[0] : evtLat;
    const srcLon = actor1Centroid ? actor1Centroid[1] : evtLon;

    // Target: resolve actor2 country centroid.
    // Fall back to a deterministic fan position so arcs never silently vanish.
    let tgtLat: number;
    let tgtLon: number;
    const actor2Centroid = resolveCentroid(f.properties.actor2_country, centroids);
    if (actor2Centroid) {
      tgtLat = actor2Centroid[0];
      tgtLon = actor2Centroid[1];
    } else {
      // Deterministic angular fallback — golden-angle fan spread
      const angle = ((i * 137.508) % 360) * (Math.PI / 180);
      const dist = 10 + (Math.abs(goldstein) / 10) * 20;
      tgtLon = srcLon + Math.cos(angle) * dist;
      tgtLat = Math.max(-85, Math.min(85, srcLat + Math.sin(angle) * dist * 0.5));
    }

    // Skip self-loops (source === target within ~1°)
    if (Math.abs(srcLat - tgtLat) < 1 && Math.abs(srcLon - tgtLon) < 1) return acc;

    // Source colour encodes conflict severity; boosted in debugMode
    const sourceAlpha = debugMode ? 255 : (goldstein <= -5 ? 210 : 170);
    const sourceColor: [number, number, number, number] =
      goldstein <= -5
        ? [255, 50, 50, sourceAlpha]    // vivid red
        : [255, 140, 0, sourceAlpha];   // vivid orange

    // Target: sovereign cyan; boosted in debugMode
    const targetColor: [number, number, number, number] = [0, 255, 230, debugMode ? 255 : 130];

    // Arc width scales with media attention; boosted in debugMode
    const width = debugMode 
      ? 8 
      : Math.min(4, Math.max(1, Math.log2(mentions + 1)));

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

export function buildGdeltArcLayer(
  gdeltData: { type: string; features: any[] } | null,
  visible: boolean,
  globeMode: boolean,
  animTick: number,
  debugMode?: boolean,
): Layer[] {
  if (!visible || !gdeltData?.features?.length) return [];

  // Use cached data if available for this specific data object
  // Bypassing cache if debugMode is active to ensure the "show all" filter is applied
  let data = arcDataCache.get(gdeltData);
  if (!data || debugMode) {
    const centroids = centroidsCache ?? {};
    data = buildArcData(gdeltData as any, centroids, debugMode);
    if (!debugMode) {
      arcDataCache.set(gdeltData, data);
    }
  }

  if (!data || !data.length) return [];

  const pulse = debugMode ? 1.0 : (0.7 + 0.3 * Math.sin(animTick * Math.PI * 2));

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
      getHeight: debugMode ? 0.8 : 0.3,
      widthUnits: "pixels",
      wrapLongitude: !globeMode,
      updateTriggers: {
        getSourceColor: animTick,
        getTargetColor: animTick,
      },
      parameters: {
        depthTest: debugMode ? false : !!globeMode,
        depthBias: (globeMode && !debugMode) ? -150.0 : 0,
      } as any,
    }),
  ];
}
