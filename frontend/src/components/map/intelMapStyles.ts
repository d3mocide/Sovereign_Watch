/**
 * Map style definitions for the Intel Globe view.
 * Kept in a separate file so IntelGlobe.tsx only exports a component
 * (required for React Fast Refresh).
 */

export type MapStyleKey = "dark" | "satellite" | "positron" | "toner" | "debug";

export const MAP_STYLE_LABELS: Record<MapStyleKey, string> = {
  dark: "DARK MATTER",
  satellite: "SATELLITE",
  positron: "LIGHT",
  toner: "TONER",
  debug: "DEBUG",
};

const DARK_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const POSITRON_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const SATELLITE_MAP_STYLE = {
  version: 8 as const,
  sources: {
    "esri-satellite": {
      type: "raster" as const,
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: "satellite-layer", type: "raster" as const, source: "esri-satellite" },
  ],
};

const TONER_MAP_STYLE = {
  version: 8 as const,
  sources: {
    "stadia-toner": {
      type: "raster" as const,
      tiles: [
        "https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 18,
      attribution:
        "Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap, under ODbL.",
    },
  },
  layers: [
    { id: "toner-layer", type: "raster" as const, source: "stadia-toner" },
  ],
};

const DEBUG_MAP_STYLE = {
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

export function resolveMapStyle(key: MapStyleKey): string | object {
  switch (key) {
    case "satellite":
      return SATELLITE_MAP_STYLE;
    case "positron":
      return POSITRON_MAP_STYLE;
    case "toner":
      return TONER_MAP_STYLE;
    case "debug":
      return DEBUG_MAP_STYLE;
    default:
      return DARK_MAP_STYLE;
  }
}

export function getBaseMapTileUrl(key: MapStyleKey): string | null {
  switch (key) {
    case "satellite":
      return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    case "positron":
      return "https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png";
    case "toner":
      return "https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png";
    case "debug":
      return null;
    default:
      return "https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png";
  }
}
