/**
 * buildFIRMSLayer — NASA FIRMS VIIRS/MODIS thermal hotspot beacon layers.
 *
 * Visual encoding:
 *   heat bloom   — restrained meter-scale aura for thermal footprint
 *   alert ring   — pulsing pixel-scale ring that reads as a live sensor hit
 *   core         — compact bright center for precise pick targeting
 *
 * Z-order: Tier 4 (Infra Assets) — depthBias -92.0, below NDBC buoys.
 */

import type { Layer } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { FIRMSHotspotProperties } from "../types";

type RGBA = [number, number, number, number];

/** Map confidence + day/night to RGBA fill colour. */
function hotspotColor(
  confidence: string | null,
  daynight: string | null,
): RGBA {
  const conf = (confidence ?? "").toLowerCase();
  const night = (daynight ?? "").toUpperCase() === "N";

  if (conf === "low" || conf === "") return [160, 160, 160, 100];

  if (night) {
    return conf === "high"
      ? [255, 230, 20, 250]    // vibrant yellow-green flash — high-confidence night
      : [255, 120, 10, 230];   // intense orange — nominal night
  }
  return conf === "high"
    ? [255, 255, 100, 220]     // bright yellow-white — high-confidence daytime
    : [255, 180, 20, 200];     // amber — nominal daytime
}

function withAlpha(color: RGBA, alpha: number): RGBA {
  return [color[0], color[1], color[2], alpha];
}

/** Radius in metres: restrained bloom that scales sublinearly with FRP. */
function hotspotBloomRadius(frp: number | null): number {
  const frpVal = Math.max(0, frp ?? 0);
  const scaled = Math.sqrt(frpVal) * 950;
  return Math.min(2_000 + scaled, 18_000);
}

function hotspotRingRadiusPixels(frp: number | null, pulse: number): number {
  const frpVal = Math.max(0, frp ?? 0);
  const scaled = Math.min(Math.sqrt(frpVal) * 0.6, 7);
  return 10 + scaled + pulse * 4;
}

function hotspotCoreRadiusPixels(frp: number | null): number {
  const frpVal = Math.max(0, frp ?? 0);
  return Math.min(4 + Math.sqrt(frpVal) * 0.22, 9);
}

export function buildFIRMSLayer(
  firmsData: FeatureCollection | null,
  visible: boolean,
  globeMode: boolean,
  now: number,
  setHoveredInfra: (info: unknown) => void,
  setSelectedInfra: (info: unknown) => void,
): Layer[] {
  if (!visible || !firmsData?.features?.length) return [];

  const pulse = (Math.sin(now / 420) + 1) / 2;

  // Add layer tag to features for the picker
  const data = firmsData.features.map(f => ({
    ...f,
    properties: {
      ...f.properties,
      layer: "firms",
      type: "firms_hotspot"
    }
  })) as any[];

  const layerParams = {
    parameters: {
      depthTest: globeMode,
      depthBias: globeMode ? -92.0 : 0,
    } as Record<string, unknown>,
  };

  return [
    new ScatterplotLayer<Feature<Point, FIRMSHotspotProperties>>({
      id: `firms-heat-bloom-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: false,
      opacity: 1.0,

      getPosition: (d) => d.geometry.coordinates as [number, number],
      getRadius: (d) => hotspotBloomRadius(d.properties.frp),
      radiusUnits: "meters",
      radiusMinPixels: 10,
      radiusMaxPixels: 34,

      filled: true,
      stroked: false,
      getFillColor: (d) => withAlpha(
        hotspotColor(d.properties.confidence, d.properties.daynight),
        42 + Math.round(pulse * 18),
      ),

      ...layerParams,
    }),

    new ScatterplotLayer<Feature<Point, FIRMSHotspotProperties>>({
      id: `firms-alert-ring-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: false,
      opacity: 1.0,

      getPosition: (d) => d.geometry.coordinates as [number, number],

      getRadius: (d) => hotspotRingRadiusPixels(d.properties.frp, pulse),
      radiusUnits: "pixels",
      radiusMinPixels: 9,
      radiusMaxPixels: 22,

      filled: false,
      stroked: true,
      getLineColor: (d) => withAlpha(
        hotspotColor(d.properties.confidence, d.properties.daynight),
        150 + Math.round(pulse * 70),
      ),
      lineWidthMinPixels: 2,
      lineWidthMaxPixels: 4,

      ...layerParams,
    }),

    new ScatterplotLayer<Feature<Point, FIRMSHotspotProperties>>({
      id: `firms-core-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: true,
      opacity: 1.0,

      getPosition: (d) => d.geometry.coordinates as [number, number],
      getRadius: (d) => hotspotCoreRadiusPixels(d.properties.frp),
      radiusUnits: "pixels",
      radiusMinPixels: 4,
      radiusMaxPixels: 10,

      filled: true,
      getFillColor: (d) => withAlpha(
        hotspotColor(d.properties.confidence, d.properties.daynight),
        232,
      ),
      stroked: true,
      getLineColor: [255, 250, 220, 220],
      lineWidthMinPixels: 1,
      lineWidthMaxPixels: 2,

      ...layerParams,

      onHover: (info) => setHoveredInfra(info),
      onClick: (info) => setSelectedInfra(info),
    }),
  ];
}
