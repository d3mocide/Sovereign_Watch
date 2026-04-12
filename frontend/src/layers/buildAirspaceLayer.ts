import { GeoJsonLayer } from "@deck.gl/layers";
import type { FeatureCollection } from "geojson";

// ── Zone type colour palette ──────────────────────────────────────────────────
// Matches the colours set by the OpenAIP source on ingestion.
// Fallback is slate-400 for unknown types.

const TYPE_FILL_ALPHA = 45;   // very translucent fill so terrain/tracks show through
const TYPE_LINE_ALPHA = 200;  // solid border

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
    alpha,
  ];
}

const TYPE_COLORS: Record<string, string> = {
  PROHIBITED: "#ef4444",   // red-500
  RESTRICTED: "#f97316",   // orange-500
  DANGER:     "#eab308",   // yellow-500
  WARNING:    "#f59e0b",   // amber-500
  TRA:        "#8b5cf6",   // violet-500
  TSA:        "#a855f7",   // purple-500
  ADIZ:       "#06b6d4",   // cyan-500
};

function zoneColor(feature: any, alpha: number): [number, number, number, number] {
  const color: string =
    feature.properties?.color ??
    TYPE_COLORS[feature.properties?.type as string] ??
    "#94a3b8"; // slate-400 fallback
  return hexToRgba(color, alpha);
}

// ── Layer builder ─────────────────────────────────────────────────────────────

interface AirspaceLayerOptions {
  data: FeatureCollection | null;
  enabled: boolean;
  globeMode: boolean;
  onHover: (info: unknown) => void;
  onSelect: (info: unknown) => void;
}

export function buildAirspaceLayer({
  data,
  enabled,
  globeMode,
  onHover,
  onSelect,
}: AirspaceLayerOptions) {
  if (!data || !enabled || data.features.length === 0) return [];

  return [
    new GeoJsonLayer({
      id: `airspace-zones-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: true,
      stroked: true,
      filled: true,
      // Polygons: translucent fill + visible border
      getFillColor: (f: any) => zoneColor(f, TYPE_FILL_ALPHA),
      getLineColor: (f: any) => zoneColor(f, TYPE_LINE_ALPHA),
      lineWidthMinPixels: 1,
      lineWidthMaxPixels: 3,
      getLineWidth: 800,    // meters — visible at low zoom without overwhelming the map
      lineWidthUnits: "meters",
      updateTriggers: {
        getFillColor: [],
        getLineColor: [],
      },
      parameters: {
        depthTest: !!globeMode,
        depthMask: false,           // don't block layers above (entity chevrons etc.)
        depthBias: globeMode ? -40.0 : 0,
      },
      onHover,
      onClick: onSelect,
    }),
  ];
}
