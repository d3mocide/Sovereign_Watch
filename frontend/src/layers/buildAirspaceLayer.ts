import { GeoJsonLayer } from "@deck.gl/layers";
import type { FeatureCollection } from "geojson";

// ── Zone type colour palette ──────────────────────────────────────────────────
// Matches the colours set by the OpenAIP source on ingestion.
// Fallback is slate-400 for unknown types.

const TYPE_FILL_ALPHA = 65;   // tactical fill
const TYPE_LINE_ALPHA = 255;  // solid border

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
  PROHIBITED: "#f43f5e",   // rose-500
  RESTRICTED: "#f97316",   // orange-500
  DANGER:     "#eab308",   // yellow-500
  WARNING:    "#fbbf24",   // amber-400
  TRA:        "#818cf8",   // indigo-400
  TSA:        "#d946ef",   // fuchsia-500
  ADIZ:       "#06b6d4",   // cyan-500
  CTR:        "#3b82f6",   // blue-500
  TMA:        "#3b82f6",
  CLASS:      "#3b82f6",
  CONTROL:    "#3b82f6",
  FIR:        "#6366f1",   // indigo-500
  MILITARY:   "#94a3b8",   // slate-400
  FIS:        "#10b981",   // emerald-500
  VFR:        "#10b981",
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
  /** Allow-list of zone types to show. If undefined/empty, all types are shown. */
  enabledTypes?: string[];
}

export function buildAirspaceLayer({
  data,
  enabled,
  globeMode,
  onHover,
  onSelect,
  enabledTypes,
}: AirspaceLayerOptions) {
  if (!data || !enabled || data.features.length === 0) return [];

  // Apply client-side type filter if an allow-list is specified
  const filteredData: FeatureCollection =
    enabledTypes && enabledTypes.length > 0
      ? {
          ...data,
          features: data.features.filter((f) => {
            const type = (f as any).properties?.type as string | undefined;
            return type && enabledTypes.includes(type);
          }),
        }
      : data;

  if (filteredData.features.length === 0) return [];

  const typeKey = enabledTypes?.slice().sort().join(",") ?? "all";

  return [
    new GeoJsonLayer({
      id: `airspace-zones-${globeMode ? "globe" : "merc"}`,
      data: filteredData,
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
        getFillColor: [typeKey],
        getLineColor: [typeKey],
      },
      parameters: {
        depthTest: !!globeMode,
        depthMask: false,           // don't block layers above (entity chevrons etc.)
        depthBias: globeMode ? -45.0 : 0,
      },
      onHover,
      onClick: onSelect,
    }),
  ];
}
