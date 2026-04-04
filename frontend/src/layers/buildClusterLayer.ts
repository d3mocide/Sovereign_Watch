import type { Layer } from "@deck.gl/core";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { ClusterInfo } from "../api/clusters";

const CLUSTER_BASE_RADIUS_M = 3000;
const CLUSTER_MAX_RADIUS_M = 15000;

/**
 * Renders ST-DBSCAN cluster centroids as pulsed amber circles with entity-count labels.
 * Z-order: above H3 risk hexagons, below entity chevrons.
 */
export function buildClusterLayer(
  clusters: ClusterInfo[],
  visible: boolean,
  now: number,
): Layer[] {
  if (!visible || clusters.length === 0) return [];

  const pulse = (Math.sin(now / 800) + 1) / 2;

  return [
    new ScatterplotLayer<ClusterInfo>({
      id: "stdbscan-cluster-halo",
      data: clusters,
      getPosition: (d) => [d.centroid_lon, d.centroid_lat],
      getRadius: (d) =>
        Math.min(
          CLUSTER_BASE_RADIUS_M + d.entity_count * 500,
          CLUSTER_MAX_RADIUS_M,
        ),
      radiusUnits: "meters",
      getFillColor: [251, 146, 60, Math.round(28 + pulse * 38)],
      getLineColor: [251, 146, 60, Math.round(160 + pulse * 60)],
      stroked: true,
      getLineWidth: 700,
      lineWidthUnits: "meters",
      pickable: false,
      updateTriggers: {
        getFillColor: [now],
        getLineColor: [now],
      },
    }),
    new TextLayer<ClusterInfo>({
      id: "stdbscan-cluster-label",
      data: clusters,
      getPosition: (d) => [d.centroid_lon, d.centroid_lat],
      getText: (d) => `CLSTR·${d.entity_count}`,
      getSize: 10,
      getColor: [251, 146, 60, 220],
      background: true,
      getBackgroundColor: [15, 10, 5, 200],
      getBorderColor: [251, 146, 60, 160],
      getBorderWidth: 1,
      backgroundPadding: [5, 3],
      getPixelOffset: [0, -30],
      fontFamily: "monospace",
      fontWeight: 700,
      billboard: true,
      pickable: false,
    }),
  ];
}
