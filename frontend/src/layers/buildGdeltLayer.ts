import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { PickingInfo } from "@deck.gl/core";

interface GdeltFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    url?: string;
    domain?: string;
    tone?: number;
    toneColor?: [number, number, number, number];
    dateadded?: string;
  };
}

/**
 * Returns a tone label string for a Goldstein tone score.
 * Used in hover/click tooltips.
 */
export function gdeltToneLabel(tone: number): string {
  if (tone <= -5) return "HIGH CONFLICT";
  if (tone <= -2) return "CONFLICT";
  if (tone < 0) return "NEGATIVE";
  if (tone < 2) return "NEUTRAL";
  return "COOPERATIVE";
}

/**
 * Builds Deck.gl layers for GDELT geolocated news events.
 *
 * Dot color encodes Goldstein tone:
 *   red     → high conflict (tone ≤ -5)
 *   orange  → moderate conflict (-5 < tone ≤ -2)
 *   yellow  → slight negative (-2 < tone < 0)
 *   lime    → neutral/positive (0 ≤ tone < 2)
 *   green   → cooperative (tone ≥ 2)
 *
 * Clicking a dot opens the source article in a new tab.
 */
export function buildGdeltLayer(
  gdeltData: { type: string; features: GdeltFeature[] } | null,
  visible: boolean,
  globeMode: boolean,
): Layer[] {
  if (!visible || !gdeltData?.features?.length) return [];

  const features = gdeltData.features;

  const data = features.map((f) => ({
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    name: f.properties.name || "",
    url: f.properties.url || "",
    domain: f.properties.domain || "",
    tone: f.properties.tone ?? 0,
    toneColor: f.properties.toneColor || [163, 230, 53, 180],
  }));

  type GdeltPoint = (typeof data)[number];

  return [
    // Outer glow ring
    new ScatterplotLayer<GdeltPoint>({
      id: `gdelt-glow-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: false,
      stroked: true,
      filled: false,
      getPosition: (d) => [d.lon, d.lat, 0],
      getRadius: 18000,
      radiusUnits: "meters",
      getLineColor: (d) => {
        const c = d.toneColor as [number, number, number, number];
        return [c[0], c[1], c[2], 60];
      },
      getLineWidth: 4000,
      lineWidthUnits: "meters",
      wrapLongitude: !globeMode,
      parameters: { depthTest: !!globeMode, depthBias: globeMode ? -100.0 : 0 },
    }),

    // Filled dot
    new ScatterplotLayer<GdeltPoint>({
      id: `gdelt-dots-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: true,
      stroked: true,
      filled: true,
      getPosition: (d) => [d.lon, d.lat, 0],
      getRadius: 7000,
      radiusUnits: "meters",
      radiusMinPixels: 3,
      radiusMaxPixels: 10,
      getFillColor: (d) => d.toneColor as [number, number, number, number],
      getLineColor: [0, 0, 0, 120],
      getLineWidth: 1,
      lineWidthUnits: "pixels",
      wrapLongitude: !globeMode,
      parameters: { depthTest: !!globeMode, depthBias: globeMode ? -100.0 : 0 },
      onHover: (info: PickingInfo<GdeltPoint>) => {
        if (info.object) {
          info.object; // handled by MapTooltip via hoveredGdelt state in TacticalMap
        }
      },
      onClick: (info: PickingInfo<GdeltPoint>) => {
        if (info.object?.url) {
          window.open(info.object.url, "_blank", "noopener,noreferrer");
        }
      },
    }),

    // Domain label (only shown when zoomed in enough — controlled by TextLayer size)
    new TextLayer<GdeltPoint>({
      id: `gdelt-labels-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: false,
      getPosition: (d) => [d.lon, d.lat, 0],
      getText: (d) => d.domain.toUpperCase(),
      getSize: 8,
      getColor: [255, 255, 255, 140],
      getPixelOffset: [0, -14],
      fontFamily: "monospace",
      fontWeight: 600,
      background: true,
      getBackgroundColor: (d) => {
        const c = d.toneColor as [number, number, number, number];
        return [c[0], c[1], c[2], 100];
      },
      backgroundPadding: [3, 2],
      getBorderColor: (d) => {
        const c = d.toneColor as [number, number, number, number];
        return [c[0], c[1], c[2], 160];
      },
      getBorderWidth: 1,
      billboard: true,
      sizeScale: 1,
      wrapLongitude: !globeMode,
      parameters: { depthTest: !!globeMode, depthBias: globeMode ? -99.0 : 0 },
    }),
  ];
}
