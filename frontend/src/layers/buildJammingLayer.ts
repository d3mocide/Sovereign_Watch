/**
 * buildJammingLayer — GPS Jamming / Integrity Degradation overlay.
 *
 * Renders active GPS jamming zones detected by the backend JammingAnalyzer.
 * Each zone is a ScatterplotLayer circle centred on the H3 hex centroid,
 * color-coded by confidence and assessment type.
 *
 * Assessment color scheme:
 *   'jamming'       → red/orange  (intentional)
 *   'mixed'         → amber       (ambiguous)
 *   'space_weather' → purple      (solar origin)
 *   'equipment'     → blue-grey   (single aircraft fault)
 *
 * Data source: /api/jamming/active (GeoJSON FeatureCollection)
 */

import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { JammingZone } from "../types";

const ASSESSMENT_COLORS: Record<string, [number, number, number]> = {
  jamming:       [251, 60,  60],   // Red
  mixed:         [251, 191, 36],   // Amber
  space_weather: [167, 102, 255],  // Purple
  equipment:     [100, 130, 160],  // Blue-grey
};

function zoneColor(
  zone: JammingZone,
  alpha: number,
): [number, number, number, number] {
  const rgb = ASSESSMENT_COLORS[zone.assessment] ?? [200, 200, 200];
  return [...rgb, alpha] as [number, number, number, number];
}

export function buildJammingLayer(
  jammingData: any,
  visible: boolean,
  globeMode: boolean,
  now: number,
): any[] {
  if (!visible || !jammingData?.features?.length) return [];

  const features = jammingData.features as Array<{
    geometry: { coordinates: [number, number] };
    properties: JammingZone;
  }>;

  const data = features.map((f) => ({
    ...f.properties,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  })) as (JammingZone & { lon: number; lat: number })[];

  // Pulse animation: outer ring expands and fades
  const pulse = (now % 3000) / 3000; // 0→1 over 3 s

  const layers: any[] = [
    // Pulsing outer ring
    new ScatterplotLayer({
      id: `jamming-pulse-${globeMode ? "globe" : "merc"}`,
      data,
      getPosition: (d: any) => [d.lon, d.lat, 0],
      getRadius: (d: JammingZone) => {
        // H3 res-6 cell edge ≈ 36 km; pulse from 40 → 80 km
        const base = 40_000 + d.confidence * 30_000;
        return base + pulse * 40_000;
      },
      radiusUnits: "meters",
      getFillColor: [0, 0, 0, 0],
      getLineColor: (d: JammingZone) => {
        const alpha = Math.round(180 * (1 - Math.pow(pulse, 2)));
        return zoneColor(d, alpha);
      },
      getLineWidth: 2000,
      lineWidthUnits: "meters",
      stroked: true,
      filled: false,
      pickable: false,
      wrapLongitude: !globeMode,
      parameters: { depthTest: !!globeMode, depthBias: globeMode ? -30.0 : 0 },
      updateTriggers: {
        getRadius: [now],
        getLineColor: [now],
      },
    }),

    // Solid fill zone
    new ScatterplotLayer({
      id: `jamming-fill-${globeMode ? "globe" : "merc"}`,
      data,
      getPosition: (d: any) => [d.lon, d.lat, 0],
      getRadius: (d: JammingZone) => 38_000 + d.confidence * 28_000,
      radiusUnits: "meters",
      getFillColor: (d: JammingZone) => zoneColor(d, Math.round(d.confidence * 60 + 15)),
      getLineColor: (d: JammingZone) => zoneColor(d, 200),
      getLineWidth: 1500,
      lineWidthUnits: "meters",
      stroked: true,
      filled: true,
      pickable: true,
      wrapLongitude: !globeMode,
      parameters: { depthTest: !!globeMode, depthBias: globeMode ? -25.0 : 0 },
    }),

    // Label: assessment + confidence
    new TextLayer({
      id: `jamming-labels-${globeMode ? "globe" : "merc"}`,
      data,
      getPosition: (d: any) => [d.lon, d.lat, 0],
      getText: (d: JammingZone) => {
        const icon = d.assessment === "jamming" ? "⚡" :
                     d.assessment === "space_weather" ? "☀" :
                     d.assessment === "mixed" ? "?" : "!";
        return `${icon} GPS SIGINT\n${d.assessment.toUpperCase()} ${Math.round(d.confidence * 100)}%`;
      },
      getSize: 11,
      getColor: [240, 240, 240, 230],
      background: true,
      getBackgroundColor: (d: JammingZone) => {
        const rgb = ASSESSMENT_COLORS[d.assessment] ?? [60, 60, 60];
        return [...rgb, 180] as [number, number, number, number];
      },
      getBorderColor: [255, 255, 255, 100],
      getBorderWidth: 1,
      backgroundPadding: [6, 4],
      getPixelOffset: [0, -12],
      fontFamily: "monospace",
      fontWeight: 700,
      billboard: true,
      pickable: false,
      lineHeight: 1.3,
      wrapLongitude: !globeMode,
      parameters: { depthTest: !!globeMode, depthBias: globeMode ? -20.0 : 0 },
    }),
  ];

  return layers;
}
