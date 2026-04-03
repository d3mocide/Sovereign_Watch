import { Layer } from "@deck.gl/core";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { H3RiskCellData } from "../api/h3Risk";

/**
 * Maps a normalized risk score [0, 1] to an RGBA color.
 *
 * Gradient: Green (stable) → Yellow → Red (critical)
 *   0.0 → [  0, 200, 100, ~40]
 *   0.5 → [255, 200,   0, ~130]
 *   1.0 → [255,   0,  50, ~220]
 */
function riskToColor(score: number): [number, number, number, number] {
  const r = score < 0.5 ? Math.round(score * 2 * 255) : 255;
  const g =
    score < 0.5 ? 200 : Math.round((1 - (score - 0.5) * 2) * 200);
  const b = score < 0.5 ? Math.round((1 - score * 2) * 100) : 50;
  const a = Math.round(40 + score * 180);
  return [r, g, b, a];
}

/**
 * Builds an H3HexagonLayer visualizing the composite risk heat-map.
 *
 * Each hexagon is filled with a color derived from its normalized risk score:
 *   C = ω_D · Density_norm + ω_S · Sentiment_norm  (ω_D=0.6, ω_S=0.4)
 *
 * Uses updateTriggers to avoid re-rendering when data reference is unchanged.
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
      getFillColor: (d) => riskToColor(d.risk_score),
      getLineColor: [255, 255, 255, 8],
      lineWidthMinPixels: 1,
      updateTriggers: {
        getFillColor: [cells],
      },
    }),
  ];
}
