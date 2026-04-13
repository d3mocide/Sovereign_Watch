/**
 * buildFIRMSLayer — NASA FIRMS VIIRS/MODIS thermal hotspot ScatterplotLayer.
 *
 * Visual encoding:
 *   radius  — proportional to Fire Radiative Power (FRP in MW), min 6 km
 *   fill    — confidence × day/night:
 *               night + high      → deep crimson  [210, 30,  20, 240]
 *               night + nominal   → orange-red     [230, 100, 10, 210]
 *               day   + high      → amber          [255, 165,  0, 190]
 *               day   + nominal   → yellow-orange  [255, 210, 10, 160]
 *               low / unknown     → grey           [160, 160, 160, 100]
 *   stroke  — white at 40% opacity to delineate overlapping detections
 *
 * Z-order: Tier 4 (Infra Assets) — depthBias -92.0, below NDBC buoys.
 *
 * Hover tooltip: satellite, FRP, brightness, confidence, acquisition time.
 * Click: emits hotspot as a synthetic entity for the sidebar.
 */

import type { Layer } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { FIRMSHotspotProperties } from "../types";

/** Map confidence + day/night to RGBA fill colour. */
function hotspotColor(
  confidence: string | null,
  daynight: string | null,
): [number, number, number, number] {
  const conf = (confidence ?? "").toLowerCase();
  const night = (daynight ?? "").toUpperCase() === "N";

  if (conf === "low" || conf === "") return [160, 160, 160, 100];

  if (night) {
    return conf === "high"
      ? [210, 30, 20, 240]    // deep crimson — high-confidence night detection
      : [230, 100, 10, 210];  // orange-red — nominal night
  }
  return conf === "high"
    ? [255, 165, 0, 190]      // amber — high-confidence daytime
    : [255, 210, 10, 160];    // yellow-orange — nominal daytime
}

/** Radius in metres: 6 km base + FRP-scaled component, capped at 60 km. */
function hotspotRadius(frp: number | null): number {
  const frpVal = frp ?? 0;
  const base   = 6_000;
  const scaled = Math.min(frpVal * 1_200, 54_000); // 45 MW → 60 km max
  return base + scaled;
}

export function buildFIRMSLayer(
  firmsData: FeatureCollection | null,
  visible: boolean,
  globeMode: boolean,
  setHoveredInfra: (info: unknown) => void,
  setSelectedInfra: (info: unknown) => void,
): Layer[] {
  if (!visible || !firmsData?.features?.length) return [];

  return [
    new ScatterplotLayer<Feature<Point, FIRMSHotspotProperties>>({
      id: `firms-hotspots-${globeMode ? "globe" : "merc"}`,
      data: firmsData.features as Feature<Point, FIRMSHotspotProperties>[],
      pickable: true,
      opacity: 1.0,

      getPosition: (d) => d.geometry.coordinates as [number, number],

      getRadius: (d) => hotspotRadius(d.properties.frp),
      radiusUnits: "meters",
      radiusMinPixels: 3,
      radiusMaxPixels: 60,

      getFillColor: (d) => hotspotColor(d.properties.confidence, d.properties.daynight),
      getLineColor: [255, 255, 255, 100],
      stroked: true,
      lineWidthMinPixels: 1,

      parameters: {
        depthTest: globeMode,
        depthBias: globeMode ? -92.0 : 0,
      },

      onHover: (info) => {
        setHoveredInfra(
          info.object
            ? {
                type: "firms_hotspot",
                layer: "firms",
                ...info.object.properties,
                coordinates: info.object.geometry.coordinates,
              }
            : null,
        );
      },

      onClick: (info) => {
        if (info.object) {
          setSelectedInfra({
            type: "firms_hotspot",
            layer: "firms",
            ...info.object.properties,
            coordinates: info.object.geometry.coordinates,
          });
        }
      },
    }),
  ];
}
