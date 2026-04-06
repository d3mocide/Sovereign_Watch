import { Layer } from "@deck.gl/core";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { H3RiskCellData, RiskSeverity } from "../api/h3Risk";

/**
 * Maps a severity label to a fixed RGBA colour.
 *
 * Using hard threshold colours instead of a continuous gradient ensures that:
 *  - operators see the same colour regardless of relative score distribution
 *  - colour meaning is anchored to the schema-level taxonomy (LOW/MEDIUM/HIGH/CRITICAL)
 */
const SEVERITY_COLORS: Record<RiskSeverity, [number, number, number, number]> =
  {
    LOW: [0, 200, 100, 40],       // green, low opacity
    MEDIUM: [255, 200, 0, 110],   // amber
    HIGH: [255, 100, 0, 160],     // orange
    CRITICAL: [255, 0, 50, 220],  // red, high opacity
  };

function severityToColor(
  severity: RiskSeverity | undefined,
): [number, number, number, number] {
  return SEVERITY_COLORS[severity ?? "LOW"];
}

/**
 * Builds an H3HexagonLayer visualizing the composite risk heat-map.
 *
 * Each hexagon is filled with a colour anchored to its severity label:
 *   LOW → green  |  MEDIUM → amber  |  HIGH → orange  |  CRITICAL → red
 *
 * Severity is computed server-side via per-domain thresholds so all domains
 * (maritime, aviation, orbital, RF) share a common visual language.
 */
export function buildH3RiskLayer(
  cells: H3RiskCellData[],
  visible: boolean,
): Layer[] {
  if (!visible || cells.length === 0) return [];

  return [
    new H3HexagonLayer<H3RiskCellData>({
      id: "h3-risk-layer",
      data: cells,
      pickable: false,
      wireframe: false,
      filled: true,
      extruded: false,
      getHexagon: (d) => d.cell,
      getFillColor: (d) => severityToColor(d.severity),
      getLineColor: [255, 255, 255, 8],
      lineWidthMinPixels: 1,
      updateTriggers: {
        getFillColor: [cells],
      },
    }),
  ];
}
