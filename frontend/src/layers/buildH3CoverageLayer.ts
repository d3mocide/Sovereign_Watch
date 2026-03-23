import { Layer } from "@deck.gl/core";
import { H3HexagonLayer } from "@deck.gl/geo-layers";

export interface H3CellData {
  cell: string;
  lat: number;
  lon: number;
  count: number;
  interval_s: number;
  next_poll_epoch: number;
}

/**
 * Builds the H3 Hexagon debug layer.
 * @param cells - Array of H3 cell data fetched from the API.
 * @param visible - Whether the layer should be rendered.
 * @returns Array containing the layer (or empty array if not visible).
 */
export function buildH3CoverageLayer(
  cells: H3CellData[],
  visible: boolean,
): Layer[] {
  if (!visible || !cells || cells.length === 0) {
    return [];
  }

  return [
    new H3HexagonLayer<H3CellData>({
      id: "h3-coverage-layer",
      data: cells,
      pickable: true,
      wireframe: true,
      filled: true,
      extruded: false,
      getHexagon: (d: H3CellData) => d.cell,
      getFillColor: (d: H3CellData) => {
        // Green (#00ff88) for 10s interval, Grey (#334444) for 60s
        const baseColor = d.interval_s <= 10 ? [0, 255, 136] : [51, 68, 68];

        // Scale opacity based on count (0-10 mapped to 5-30) to make it very subtle
        const opacity = Math.min(30, 5 + d.count * 2.5);
        return [...baseColor, opacity] as [number, number, number, number];
      },
      getLineColor: [255, 255, 255, 10], // Even more subtle lines
      lineWidthMinPixels: 1,
      updateTriggers: {
        getFillColor: [cells],
      },
    }),
  ];
}
