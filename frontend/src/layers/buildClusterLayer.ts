import type { Layer, PickingInfo } from "@deck.gl/core";
import { CollisionFilterExtension } from "@deck.gl/extensions";
import { PolygonLayer, TextLayer } from "@deck.gl/layers";
import type { ClusterInfo } from "../api/clusters";
import type { CoTEntity } from "../types";

const CLUSTER_BASE_RADIUS_M = 3000;
const CLUSTER_MAX_RADIUS_M = 15000;

/** Build a regular polygon ring in lon/lat suitable for PolygonLayer. */
function makeOctagon(
  lon: number,
  lat: number,
  radiusM: number,
): [number, number][] {
  const sides = 8;
  // 1 degree latitude ≈ 111_320 m; longitude degree shrinks with cos(lat)
  const latDeg = radiusM / 111_320;
  const lonDeg = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  // Rotate 22.5° so a flat edge faces up (classic stop-sign orientation)
  const offset = Math.PI / 8;
  const ring: [number, number][] = [];
  for (let i = 0; i <= sides; i++) {
    const angle = offset + (i * 2 * Math.PI) / sides;
    ring.push([lon + lonDeg * Math.cos(angle), lat + latDeg * Math.sin(angle)]);
  }
  return ring;
}

/** Convert a ClusterInfo into a CoTEntity for the tooltip/sidebar system. */
function clusterToEntity(c: ClusterInfo): CoTEntity {
  return {
    uid: `cluster-${c.cluster_id}`,
    type: "cluster",
    callsign: `CLUSTER·${c.entity_count}`,
    lat: c.centroid_lat,
    lon: c.centroid_lon,
    altitude: 0,
    course: 0,
    speed: 0,
    lastSeen: new Date(c.end_time).getTime(),
    trail: [],
    uidHash: 0,
    detail: {
      entity_count: c.entity_count,
      uids: c.uids,
      start_time: c.start_time,
      end_time: c.end_time,
      centroid_lat: c.centroid_lat,
      centroid_lon: c.centroid_lon,
    } as unknown as Record<string, unknown>,
  };
}

/**
 * Renders ST-DBSCAN cluster centroids as teal octagon rings with entity-count labels.
 * Octagons visually distinguish clusters from the circular hazard overlays.
 * Z-order: above H3 risk hexagons, below entity chevrons.
 */
export function buildClusterLayer(
  clusters: ClusterInfo[],
  visible: boolean,
  globeMode: boolean,
  setHoveredEntity?: (entity: CoTEntity | null) => void,
  setHoverPosition?: (pos: { x: number; y: number } | null) => void,
  onEntitySelect?: (entity: CoTEntity | null) => void,
): Layer[] {
  if (!visible || clusters.length === 0) return [];

  // A cluster of 1 is just a lone entity — not meaningful co-location.
  const meaningful = clusters.filter((c) => c.entity_count >= 2);
  if (meaningful.length === 0) return [];

  // Pre-compute octagon polygons so PolygonLayer just reads the property.
  const withPolygon = meaningful.map((c) => ({
    ...c,
    polygon: makeOctagon(
      c.centroid_lon,
      c.centroid_lat,
      Math.min(CLUSTER_BASE_RADIUS_M + c.entity_count * 500, CLUSTER_MAX_RADIUS_M),
    ),
  }));

  type ClusterWithPoly = (typeof withPolygon)[number];

  const handleHover = (info: PickingInfo<ClusterWithPoly>) => {
    if (!setHoveredEntity || !setHoverPosition) return;
    if (!info.object) {
      setHoveredEntity(null);
      setHoverPosition(null);
      return;
    }
    setHoveredEntity(clusterToEntity(info.object));
    setHoverPosition({ x: info.x, y: info.y });
  };

  const handleClick = (info: PickingInfo<ClusterWithPoly>) => {
    if (!onEntitySelect || !info.object) return;
    onEntitySelect(clusterToEntity(info.object));
  };

  return [
    new PolygonLayer<ClusterWithPoly>({
      id: "stdbscan-cluster-octagon",
      data: withPolygon,
      getPolygon: (d) => d.polygon,
      getFillColor: [6, 182, 212, 30],
      getLineColor: [6, 182, 212, 190],
      getLineWidth: 700,
      lineWidthUnits: "meters",
      stroked: true,
      filled: true,
      pickable: true,
      onHover: handleHover,
      onClick: handleClick,
      parameters: { depthTest: !!globeMode, depthBias: globeMode ? -110.0 : 0 } as any,
    }),
    new TextLayer<ClusterWithPoly>({
      id: "stdbscan-cluster-label",
      data: withPolygon,
      getPosition: (d) => [d.centroid_lon, d.centroid_lat],
      getText: (d) => `CLSTR·${d.entity_count}`,
      getSize: 10,
      getColor: [6, 182, 212, 220],
      background: true,
      getBackgroundColor: [5, 10, 15, 200],
      getBorderColor: [6, 182, 212, 160],
      getBorderWidth: 1,
      backgroundPadding: [5, 3],
      getPixelOffset: [0, -30],
      fontFamily: "monospace",
      fontWeight: 700,
      billboard: true,
      pickable: false,
      // Collision detection: hide labels that overlap — bigger clusters win.
      // Cast required: CollisionFilterExtension props are not in the base TextLayer type.
      ...({
        extensions: [new CollisionFilterExtension()],
        collisionEnabled: true,
        collisionGroup: "cluster-labels",
        getCollisionPriority: (d: ClusterWithPoly) => d.entity_count,
      } as object),
    }),
  ];
}
