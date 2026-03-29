/**
 * buildASAMLayer — ASAM Maritime Piracy Incidents (Phase 2 Geospatial).
 *
 * Visual encoding — zoom-adaptive dual-layer strategy:
 *
 *   zoom < 6  (overview): Large semi-transparent ScatterplotLayer circles.
 *             Radius encodes threat_score (higher score → larger ring).
 *             Colour transitions from amber (low threat) to deep red (high).
 *             Allows broad geographic pattern recognition (Gulf of Guinea,
 *             Strait of Malacca, Gulf of Aden hotspots clearly visible).
 *
 *   zoom ≥ 6  (detail):   Smaller, precise dots at each incident's exact
 *             coordinates.  Stroke width increases with threat_score.
 *             Hovering shows incident details; clicking emits to sidebar.
 *
 * Threat colour scale:
 *   threat_score 0–3  → amber   [255, 180, 50]
 *   threat_score 3–6  → orange  [255, 110, 30]
 *   threat_score 6–10 → crimson [220, 30,  30]
 */

import type { Layer } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { ASAMIncidentProperties } from "../types";

/** Map threat_score (0–10) to an RGBA fill colour. */
function threatColor(score: number): [number, number, number, number] {
  const clamped = Math.max(0, Math.min(10, score));
  const t = clamped / 10; // 0 → 1

  if (t < 0.3) {
    // Amber zone (low threat)
    return [255, Math.round(180 - t * 233), 50, 200];
  }
  if (t < 0.6) {
    // Orange zone (medium threat)
    const s = (t - 0.3) / 0.3;
    return [255, Math.round(110 - s * 80), Math.round(30 - s * 30), 210];
  }
  // Crimson zone (high threat)
  const s = (t - 0.6) / 0.4;
  return [Math.round(220 - s * 20), Math.round(30 - s * 10), Math.round(30 - s * 10), 230];
}

export function buildASAMLayer(
  asamData: FeatureCollection | null,
  visible: boolean,
  zoom: number,
  globeMode: boolean,
  setHoveredInfra: (info: unknown) => void,
  setSelectedInfra: (info: unknown) => void,
): Layer[] {
  if (!visible || !asamData?.features?.length) return [];

  const features = asamData.features as Feature<Point, ASAMIncidentProperties>[];
  const isOverview = zoom < 6;

  if (isOverview) {
    // Overview layer: large threat rings for broad pattern recognition
    return [
      new ScatterplotLayer<Feature<Point, ASAMIncidentProperties>>({
        id: `asam-overview-${globeMode ? "globe" : "merc"}`,
        data: features,
        pickable: true,
        opacity: 0.55,

        getPosition: (d) => d.geometry.coordinates as [number, number],

        // Radius: 30–300 km based on threat_score
        getRadius: (d) => {
          const score = d.properties.threat_score ?? 0;
          return 30000 + score * 27000;
        },
        radiusUnits: "meters",
        radiusMinPixels: 3,
        radiusMaxPixels: 60,

        getFillColor: (d) => {
          const [r, g, b] = threatColor(d.properties.threat_score ?? 0);
          return [r, g, b, 100]; // more transparent in overview
        },

        stroked: true,
        getLineColor: (d) => threatColor(d.properties.threat_score ?? 0),
        getLineWidth: 1,
        lineWidthUnits: "pixels",

        parameters: { depthTest: !!globeMode, depthMask: !!globeMode } as any,

        onHover: (info: unknown) => setHoveredInfra(info),
        onClick: (info: unknown) => setSelectedInfra(info),

        updateTriggers: {
          getFillColor: [asamData],
          getLineColor: [asamData],
          getRadius: [asamData],
        },
      }),
    ];
  }

  // Detail layer: precise incident dots with threat colour + stroke weight
  return [
    new ScatterplotLayer<Feature<Point, ASAMIncidentProperties>>({
      id: `asam-detail-${globeMode ? "globe" : "merc"}`,
      data: features,
      pickable: true,
      opacity: 0.9,

      getPosition: (d) => d.geometry.coordinates as [number, number],

      // Radius: 8–20 km based on threat_score (precise, not giant rings)
      getRadius: (d) => {
        const score = d.properties.threat_score ?? 0;
        return 8000 + score * 1200;
      },
      radiusUnits: "meters",
      radiusMinPixels: 3,
      radiusMaxPixels: 20,

      getFillColor: (d) => threatColor(d.properties.threat_score ?? 0),

      stroked: true,
      getLineColor: [255, 255, 255, 180],
      getLineWidth: (d) => {
        const score = d.properties.threat_score ?? 0;
        return score >= 7 ? 2 : 1;
      },
      lineWidthUnits: "pixels",

      parameters: { depthTest: !!globeMode, depthMask: !!globeMode } as any,

      onHover: (info: unknown) => setHoveredInfra(info),
      onClick: (info: unknown) => setSelectedInfra(info),

      updateTriggers: {
        getFillColor: [asamData],
        getLineColor: [asamData],
        getRadius: [asamData],
        getLineWidth: [asamData],
      },
    }),
  ];
}
