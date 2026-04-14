/**
 * buildDarkVesselLayer — Dark vessel candidate ScatterplotLayer.
 *
 * Dark vessels are ships identified by VIIRS/MODIS thermal signatures that have
 * no corresponding AIS broadcast within the configured match radius.  They are
 * the output of GET /api/firms/dark-vessels.
 *
 * Visual encoding:
 *   outer ring  — unfilled stroke-only circle; radius scales with risk_score.
 *                 Colour encodes severity:
 *                   CRITICAL → pulsing scarlet  [220, 20,  20, 240]
 *                   HIGH     → orange-red        [230, 80,  10, 210]
 *                   MEDIUM   → amber             [255, 165,  0, 180]
 *                   LOW      → grey              [180, 180, 180, 130]
 *   inner dot   — filled circle at same position for pick-target visibility
 *
 * Z-order: Tier 5 (Dynamic) — depthBias -108.0 (between clusters and jamming).
 *
 * Hover tooltip: risk_severity, risk_score, FRP, satellite, nearest AIS, time.
 * Click: emits candidate as a synthetic entity for the sidebar.
 */

import type { Layer } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { DarkVesselProperties } from "../types";

type RGBA = [number, number, number, number];

function severityColor(severity: string | null): RGBA {
  switch ((severity ?? "").toUpperCase()) {
    case "CRITICAL": return [220, 20, 20, 240];
    case "HIGH":     return [230, 80, 10, 210];
    case "MEDIUM":   return [255, 165, 0, 180];
    default:         return [180, 180, 180, 130];
  }
}

/** Outer ring radius: 12 km base + risk-scaled component, max 80 km. */
function ringRadius(riskScore: number | null): number {
  const score  = Math.max(0, Math.min(riskScore ?? 0, 1));
  const base   = 12_000;
  const scaled = score * 68_000; // 0→12km, 1→80km
  return base + scaled;
}

export function buildDarkVesselLayer(
  darkVesselData: FeatureCollection | null,
  visible: boolean,
  globeMode: boolean,
  setHoveredInfra: (info: unknown) => void,
  setSelectedInfra: (info: unknown) => void,
): Layer[] {
  if (!visible || !darkVesselData?.features?.length) return [];

  // Add layer tag to features for the picker
  const data = darkVesselData.features.map(f => ({
    ...f,
    properties: {
      ...f.properties,
      layer: "dark_vessel",
      type: "dark_vessel"
    }
  })) as any[];

  const layerParams = {
    parameters: {
      depthTest: globeMode,
      depthBias: globeMode ? -108.0 : 0,
    } as Record<string, unknown>,
  };

  return [
    // Outer alert ring — stroked, no fill
    new ScatterplotLayer<Feature<Point, DarkVesselProperties>>({
      id: `dark-vessel-ring-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: false,        // inner dot handles picking
      opacity: 1.0,

      getPosition: (d) => d.geometry.coordinates as [number, number],
      getRadius: (d) => ringRadius(d.properties.risk_score),
      radiusUnits: "meters",
      radiusMinPixels: 6,
      radiusMaxPixels: 80,

      filled: false,
      stroked: true,
      getLineColor: (d) => severityColor(d.properties.risk_severity),
      lineWidthMinPixels: 2,
      lineWidthMaxPixels: 4,

      ...layerParams,
    }),

    // Inner filled dot — pick target
    new ScatterplotLayer<Feature<Point, DarkVesselProperties>>({
      id: `dark-vessel-dot-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: true,
      opacity: 1.0,

      getPosition: (d) => d.geometry.coordinates as [number, number],
      getRadius: () => 5_000,
      radiusUnits: "meters",
      radiusMinPixels: 4,
      radiusMaxPixels: 16,

      filled: true,
      getFillColor: (d) => severityColor(d.properties.risk_severity),
      stroked: true,
      getLineColor: [255, 255, 255, 180],
      lineWidthMinPixels: 1,

      ...layerParams,

      onHover: (info) => setHoveredInfra(info),
      onClick: (info) => setSelectedInfra(info),
    }),
  ];
}
