/**
 * Map style definitions for the Intel Globe view.
 * Kept in a separate file so IntelGlobe.tsx only exports a component
 * (required for React Fast Refresh).
 */

import type { StyleSpecification } from "maplibre-gl";
import { DARK_MAP_STYLE, SATELLITE_MAP_STYLE } from "./mapStyles";

export type MapStyleKey = "dark" | "satellite";

export const MAP_STYLE_LABELS: Record<MapStyleKey, string> = {
  dark: "DARK",
  satellite: "SAT",
};

export function resolveMapStyle(
  key: MapStyleKey,
): string | StyleSpecification {
  switch (key) {
    case "satellite":
      return SATELLITE_MAP_STYLE;
    default:
      return DARK_MAP_STYLE;
  }
}

export function getBaseMapTileUrl(key: MapStyleKey): string | null {
  switch (key) {
    case "satellite":
      return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    default:
      return "https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png";
  }
}
