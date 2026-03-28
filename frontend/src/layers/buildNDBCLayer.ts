/**
 * buildNDBCLayer — NDBC Ocean Buoy ScatterplotLayer (Phase 1 Geospatial).
 *
 * Visual encoding:
 *   radius  = significant wave height (WVHT, metres × 15 000), min 8 km
 *   fill    = water surface temperature (WTMP °C): blue (cold) → red (warm)
 *   stroke  = white at 60 % opacity for visibility against dark basemap
 *
 * Hover tooltip: buoy_id, WVHT, WTMP, WSPD, last update time.
 * Click: emits the buoy as a synthetic CoTEntity for the sidebar.
 */

import { ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { FeatureCollection, Feature, Point } from "geojson";
import type { NDBCBuoyProperties } from "../types";

/** Map water temperature (°C) to an RGBA colour.
 *  0 °C → deep blue [10, 80, 220]
 * 15 °C → teal      [0, 200, 180]
 * 30 °C → amber-red [255, 120, 20]
 */
function wtmpColor(wtmp: number | null): [number, number, number, number] {
  if (wtmp === null || wtmp === undefined) return [160, 160, 160, 200]; // grey = no data

  const clamped = Math.max(0, Math.min(35, wtmp));
  const t = clamped / 35; // 0 → 1

  // Blue → teal → orange-red gradient
  const r = Math.round(10  + t * 245);
  const g = Math.round(80  + t * (200 - 80) * (1 - t) * 4 + t * 40);
  const b = Math.round(220 - t * 200);

  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
    220,
  ];
}

export function buildNDBCLayer(
  buoyData: FeatureCollection | null,
  visible: boolean,
  globeMode: boolean,
  setHoveredInfra: (info: unknown) => void,
  setSelectedInfra: (info: unknown) => void,
): Layer[] {
  if (!visible || !buoyData?.features?.length) return [];

  return [
    new ScatterplotLayer({
      id: `ndbc-buoys-${globeMode ? "globe" : "merc"}`,
      data: buoyData.features as Feature<Point, NDBCBuoyProperties>[],
      pickable: true,
      opacity: 0.85,

      getPosition: (d: Feature<Point, NDBCBuoyProperties>) =>
        d.geometry.coordinates as [number, number],

      // Radius encodes wave height; minimum 8 km so buoys are always visible
      getRadius: (d: Feature<Point, NDBCBuoyProperties>) => {
        const wvht = d.properties.wvht_m;
        return wvht !== null && wvht > 0 ? wvht * 15000 : 8000;
      },
      radiusUnits: "meters",
      radiusMinPixels: 4,
      radiusMaxPixels: 40,

      // Fill encodes water temperature
      getFillColor: (d: Feature<Point, NDBCBuoyProperties>) =>
        wtmpColor(d.properties.wtmp_c),

      stroked: true,
      getLineColor: [255, 255, 255, 90],
      getLineWidth: 1,
      lineWidthUnits: "pixels",

      parameters: { depthTest: !!globeMode, depthMask: !!globeMode },

      onHover: (info: unknown) => setHoveredInfra(info),
      onClick: (info: unknown) => setSelectedInfra(info),

      updateTriggers: {
        getFillColor: [buoyData],
        getRadius: [buoyData],
      },
    }),
  ];
}
