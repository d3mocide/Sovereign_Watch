import { GeoJsonLayer } from "@deck.gl/layers";
import type { FeatureCollection } from "geojson";

// ── NOTAM category colour palette (NOTAM-coded by hazard level) ───────────────

const CATEGORY_COLORS: Record<string, [number, number, number]> = {
  TFR:           [239,  68,  68],  // red-500  — Temporary Flight Restriction (highest priority)
  AIRSPACE:      [249, 115,  22],  // orange-500
  GPS_OUTAGE:    [234, 179,   8],  // yellow-500 — GPS test / interference
  OBSTACLE:      [168,  85, 247],  // purple-500
  RUNWAY:        [59,  130, 246],  // blue-500
  TAXIWAY:       [99,  102, 241],  // indigo-500
  MILITARY:      [220,  38,  38],  // red-600
  LASER:         [236,  72, 153],  // pink-500
  DRONE:         [20,  184, 166],  // teal-500
  PARACHUTE:     [16,  185, 129],  // emerald-500
  FIREWORK:      [251, 146,  60],  // orange-400
  SERVICE:       [148, 163, 184],  // slate-400
  NAVAID:        [100, 116, 139],  // slate-500
  COMMUNICATIONS:[100, 116, 139],  // slate-500
  OTHER:         [100, 116, 139],  // slate-500
};

function categoryColor(
  category: string | undefined,
  alpha: number,
): [number, number, number, number] {
  const rgb = CATEGORY_COLORS[category ?? "OTHER"] ?? CATEGORY_COLORS.OTHER;
  return [...rgb, alpha] as [number, number, number, number];
}

// ── Layer builder ──────────────────────────────────────────────────────────────

interface NOTAMLayerOptions {
  data: FeatureCollection | null;
  enabled: boolean;
  globeMode: boolean;
  now: number;
  onHover: (info: unknown) => void;
  onSelect: (info: unknown) => void;
}

export function buildNOTAMLayer({
  data,
  enabled,
  globeMode,
  now,
  onHover,
  onSelect,
}: NOTAMLayerOptions) {
  if (!data || !enabled || data.features.length === 0) return [];

  // Pulse: 0 → 1 every ~2 s (same timing as jamming layer)
  const pulse = (Math.sin(now / 800) + 1) / 2;
  const outerAlpha = Math.round(60 + pulse * 80);
  const innerAlpha = Math.round(160 + pulse * 80);

  const layers = [];

  // Outer halo — pulsed, low opacity
  layers.push(
    new GeoJsonLayer({
      id: `notam-halo-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: false,
      stroked: false,
      filled: true,
      pointType: "circle",
      getPointRadius: 18_000, // 18 km halo
      pointRadiusUnits: "meters",
      getFillColor: (f: any) =>
        categoryColor(f.properties?.category, outerAlpha),
      updateTriggers: {
        getFillColor: [now],
      },
      parameters: {
        depthTest: !!globeMode,
        depthMask: false,
        depthBias: globeMode ? -30.0 : 0,
      },
    }),
  );

  // Inner dot — solid, pickable
  layers.push(
    new GeoJsonLayer({
      id: `notam-dot-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: true,
      stroked: true,
      filled: true,
      pointType: "circle",
      getPointRadius: 6_000, // 6 km inner dot
      pointRadiusUnits: "meters",
      getFillColor: (f: any) =>
        categoryColor(f.properties?.category, innerAlpha),
      getLineColor: [255, 255, 255, 120],
      lineWidthMinPixels: 1,
      updateTriggers: {
        getFillColor: [now],
      },
      parameters: {
        depthTest: !!globeMode,
        depthMask: !!globeMode,
        depthBias: globeMode ? -20.0 : 0,
      },
      onHover,
      onClick: onSelect,
    }),
  );

  // Labels — shown at zoom ≥ 7 (deck.gl doesn't know zoom here; caller can skip via enabled flag)
  layers.push(
    new GeoJsonLayer({
      id: `notam-label-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: false,
      pointType: "text",
      getText: (f: any) => {
        const cat = f.properties?.category ?? "NOTAM";
        const icao = f.properties?.icao_id ?? "";
        return icao ? `${cat}\n${icao}` : cat;
      },
      getTextSize: 9,
      getTextColor: [240, 240, 240, 220],
      getTextAnchor: "middle",
      getAlignmentBaseline: "bottom",
      getTextPixelOffset: [0, -14],
      textFontFamily: "monospace",
      textFontWeight: 700,
      textBackground: true,
      getTextBackgroundColor: [10, 10, 10, 180],
      textBorderColor: (f: any) =>
        categoryColor(f.properties?.category, 180),
      textBorderWidth: 1,
      textBackgroundPadding: [4, 2],
      parameters: {
        depthTest: !!globeMode,
        depthMask: false,
        depthBias: globeMode ? -10.0 : 0,
      },
    }),
  );

  return layers;
}
