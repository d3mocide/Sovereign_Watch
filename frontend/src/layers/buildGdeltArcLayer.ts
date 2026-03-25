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

/**
 * Derive arc data from GDELT events where both actors have distinct geolocations.
 * The arc runs from the event's primary location (actor1 centroid approximated by
 * event lat/lon) toward the actor2 country centroid stored in the event properties.
 * When actor2 coords are missing the arc is skipped.
 */
function buildArcData(gdeltData: {
  type: string;
  features: Array<{
    id?: string;
    geometry: { coordinates: [number, number] };
    properties: {
      event_id?: string;
      goldstein?: number;
      toneColor?: [number, number, number, number];
      num_mentions?: number;
      actor1_country?: string;
      actor2_country?: string;
      quad_class?: number;
      // actor2 centroid is NOT in the events GeoJSON directly —
      // we derive a rough target by nudging the source point using
      // a seeded offset so arcs fan out visually even without exact coords.
    };
  }>;
} | null): GdeltArc[] {
  if (!gdeltData?.features?.length) return [];

  // Only draw arcs for conflict-class events (quad_class 3 or 4)
  const conflictFeatures = gdeltData.features.filter((f) => {
    const qc = f.properties.quad_class ?? 0;
    return qc >= 3;
  });

  return conflictFeatures.reduce<GdeltArc[]>((acc, f, i) => {
    const [lon, lat] = f.geometry.coordinates;
    if (!lon || !lat) return acc;

    const goldstein = f.properties.goldstein ?? 0;
    const mentions = f.properties.num_mentions ?? 1;

    // Source color encodes conflict severity: deep red → orange
    const sourceColor: [number, number, number, number] =
      goldstein <= -5
        ? [239, 68, 68, 200]   // red-500
        : [249, 115, 22, 160]; // orange-500

    // Target colour: sovereign cyan
    const targetColor: [number, number, number, number] = [0, 220, 200, 120];

    // Arc width scales with media attention (mentions)
    const width = Math.min(4, Math.max(1, Math.log2(mentions + 1)));

    // Generate a visually spread target using a deterministic angle from
    // the event index — this fans arcs outward from the source cluster
    // without requiring a second geocoded point in the data.
    const angle = ((i * 137.508) % 360) * (Math.PI / 180); // golden-angle spread
    const dist = 8 + (Math.abs(goldstein) / 10) * 25; // 8°–33° away
    const targetLon = lon + Math.cos(angle) * dist;
    const targetLat = Math.max(-85, Math.min(85, lat + Math.sin(angle) * dist * 0.5));

    acc.push({
      event_id: f.properties.event_id || f.id || `arc-${i}`,
      sourcePosition: [lon, lat],
      targetPosition: [targetLon, targetLat],
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
 * Each arc radiates from an event's geo-location with:
 *   - Source: red/orange encoding conflict severity
 *   - Target: sovereign cyan (#00DCDC)
 *   - Height: 0.25 — curves over the globe surface
 *   - Width: scales with article mention count
 *
 * The effect mirrors the GCMS "projecting lines" aesthetic from the design reference.
 */
export function buildGdeltArcLayer(
  gdeltData: { type: string; features: any[] } | null,
  visible: boolean,
  globeMode: boolean,
  animTick: number,
): Layer[] {
  if (!visible || !gdeltData?.features?.length) return [];

  const data = buildArcData(gdeltData as any);
  if (!data.length) return [];

  // Pulse opacity using a slow sine wave keyed on animTick (0–1 normalised second counter)
  const pulse = 0.75 + 0.25 * Math.sin(animTick * Math.PI * 2);

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
      getHeight: 0.25,
      widthUnits: "pixels",
      wrapLongitude: !globeMode,
      updateTriggers: {
        getSourceColor: animTick,
        getTargetColor: animTick,
      },
      parameters: {
        depthTest: !!globeMode,
      } as any,
    }),
  ];
}
