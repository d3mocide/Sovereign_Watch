/**
 * mapStyles.ts — shared map style constants and lazy adapter imports.
 *
 * Centralises the three pieces of identical boilerplate that used to live at the
 * top of every map component (TacticalMap, OrbitalMap, IntelGlobe):
 *   1. ESRI satellite + CARTO dark raster styles
 *   2. Mapbox token detection
 *   3. Lazy adapter imports (MapLibre / Mapbox react-map-gl endpoints)
 */

import { type ComponentType, lazy } from "react";

// ---------------------------------------------------------------------------
// Raster tile styles
// ---------------------------------------------------------------------------

/** ESRI World Imagery — no API key required, used as the satellite basemap. */
export const SATELLITE_MAP_STYLE = {
  version: 8 as const,
  sources: {
    "esri-satellite": {
      type: "raster" as const,
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    },
  },
  layers: [
    {
      id: "satellite-layer",
      type: "raster" as const,
      source: "esri-satellite",
    },
  ],
};

/** CARTO dark-matter — default tactical basemap, no API key required. */
export const DARK_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// ---------------------------------------------------------------------------
// Mapbox token detection (module-level, evaluated once)
// ---------------------------------------------------------------------------

export const _mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as
  | string
  | undefined;
export const _enableMapbox = import.meta.env.VITE_ENABLE_MAPBOX !== "false";
export const _isValidToken =
  !!_mapboxToken && _mapboxToken.startsWith("pk.");

// ---------------------------------------------------------------------------
// Lazy adapter imports
// ---------------------------------------------------------------------------
// Pre-load both adapters so React doesn't re-suspend when toggling Globe mode.
// react-map-gl v8 bakes the GL library into the entry point, so we lazy-load
// the correct adapter rather than using the removed `mapLib` prop.
// Globe mode always uses MapLibre — Mapbox Globe blocks CustomLayerInterface
// which is required by MapboxOverlay for interleaved rendering.

export const MapboxAdapterLazy: ComponentType<any> = lazy(
  () => import("./MapboxAdapter"),
);

export const MapLibreAdapterLazy: ComponentType<any> = lazy(
  () => import("./MapLibreAdapter"),
);
