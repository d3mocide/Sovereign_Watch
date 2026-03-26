/**
 * Map style definitions for the Intel Globe view.
 * Kept in a separate file so IntelGlobe.tsx only exports a component
 * (required for React Fast Refresh).
 */

import type { StyleSpecification } from "maplibre-gl";

export type MapStyleKey = "dark" | "debug";

export const MAP_STYLE_LABELS: Record<MapStyleKey, string> = {
  dark: "DARK MATTER",
  debug: "DEBUG",
};

const DARK_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const DEBUG_MAP_STYLE: StyleSpecification = {
  version: 8 as const,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background" as const,
      paint: { "background-color": "#0a0a0a" },
    },
  ],
};

export function resolveMapStyle(key: MapStyleKey): string | StyleSpecification {
  switch (key) {
    case "debug":
      return DEBUG_MAP_STYLE;
    default:
      return DARK_MAP_STYLE;
  }
}

export function getBaseMapTileUrl(key: MapStyleKey): string | null {
  switch (key) {
    case "debug":
      return null;
    default:
      return "https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png";
  }
}
