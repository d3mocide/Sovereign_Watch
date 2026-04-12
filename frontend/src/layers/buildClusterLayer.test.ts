/**
 * Unit tests for buildClusterLayer.
 *
 * PolygonLayer, TextLayer and CollisionFilterExtension are mocked so tests
 * run without WebGL.  Covers guard conditions, cluster filtering, octagon
 * geometry, layer composition, and the clusterToEntity conversion.
 */

import { describe, expect, it, vi } from "vitest";
import type { ClusterInfo } from "../api/clusters";

// ── deck.gl mock ──────────────────────────────────────────────────────────────

vi.mock("@deck.gl/layers", () => {
  class PolygonLayer {
    id: string;
    props: Record<string, unknown>;
    constructor(props: Record<string, unknown>) {
      this.id = props.id as string;
      this.props = props;
    }
  }
  class TextLayer {
    id: string;
    props: Record<string, unknown>;
    constructor(props: Record<string, unknown>) {
      this.id = props.id as string;
      this.props = props;
    }
  }
  return { PolygonLayer, TextLayer };
});

vi.mock("@deck.gl/extensions", () => ({
  CollisionFilterExtension: class {
    extensionName = "CollisionFilterExtension";
  },
}));

import { buildClusterLayer } from "./buildClusterLayer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
  return {
    cluster_id: "1",
    entity_count: 3,
    centroid_lat: 45.5,
    centroid_lon: -122.6,
    start_time: "2026-04-12T00:00:00Z",
    end_time: "2026-04-12T01:00:00Z",
    uids: ["A", "B", "C"],
    ...overrides,
  };
}

// ── Guard conditions ──────────────────────────────────────────────────────────

describe("buildClusterLayer — guard conditions", () => {
  it("returns empty array when visible=false", () => {
    expect(buildClusterLayer([makeCluster()], false, false)).toEqual([]);
  });

  it("returns empty array when clusters array is empty", () => {
    expect(buildClusterLayer([], true, false)).toEqual([]);
  });

  it("returns empty array when all clusters have entity_count < 2", () => {
    const singleton = makeCluster({ entity_count: 1 });
    expect(buildClusterLayer([singleton], true, false)).toEqual([]);
  });

  it("includes clusters with entity_count >= 2", () => {
    const pair = makeCluster({ entity_count: 2 });
    expect(buildClusterLayer([pair], true, false)).not.toEqual([]);
  });
});

// ── Layer composition ─────────────────────────────────────────────────────────

describe("buildClusterLayer — layer composition", () => {
  const clusters = [makeCluster()];

  it("returns exactly two layers (polygon + text)", () => {
    expect(buildClusterLayer(clusters, true, false)).toHaveLength(2);
  });

  it("first layer is the octagon PolygonLayer", () => {
    const layers = buildClusterLayer(clusters, true, false) as any[];
    expect(layers[0].id).toBe("stdbscan-cluster-octagon");
  });

  it("second layer is the label TextLayer", () => {
    const layers = buildClusterLayer(clusters, true, false) as any[];
    expect(layers[1].id).toBe("stdbscan-cluster-label");
  });

  it("polygon layer is pickable", () => {
    const layers = buildClusterLayer(clusters, true, false) as any[];
    expect(layers[0].props.pickable).toBe(true);
  });

  it("text label layer is not pickable", () => {
    const layers = buildClusterLayer(clusters, true, false) as any[];
    expect(layers[1].props.pickable).toBe(false);
  });
});

// ── Octagon geometry ──────────────────────────────────────────────────────────

describe("buildClusterLayer — octagon geometry", () => {
  it("getPolygon accessor is a function", () => {
    const layers = buildClusterLayer([makeCluster({ entity_count: 5 })], true, false) as any[];
    expect(layers[0].props.getPolygon).toBeTypeOf("function");
  });

  it("polygon layer passes pre-computed polygon property", () => {
    const cluster = makeCluster({ entity_count: 5, centroid_lat: 45.5, centroid_lon: -122.6 });
    const layers = buildClusterLayer([cluster], true, false) as any[];
    // The withPolygon items have a polygon array on them
    const dataItem = (layers[0].props.data as any[])[0];
    expect(Array.isArray(dataItem.polygon)).toBe(true);
    expect(dataItem.polygon.length).toBe(9); // 8 sides + closing point
  });

  it("octagon ring closes (first point equals last)", () => {
    const cluster = makeCluster({ entity_count: 5 });
    const layers = buildClusterLayer([cluster], true, false) as any[];
    const ring = (layers[0].props.data as any[])[0].polygon as [number, number][];
    expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0]);
    expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1]);
  });
});

// ── Globe mode ────────────────────────────────────────────────────────────────

describe("buildClusterLayer — globe mode parameters", () => {
  it("depthTest is true in globe mode", () => {
    const layers = buildClusterLayer([makeCluster()], true, true) as any[];
    expect((layers[0].props.parameters as any).depthTest).toBe(true);
  });

  it("depthTest is false in mercator mode", () => {
    const layers = buildClusterLayer([makeCluster()], true, false) as any[];
    expect((layers[0].props.parameters as any).depthTest).toBe(false);
  });
});

// ── Text label content ────────────────────────────────────────────────────────

describe("buildClusterLayer — text label", () => {
  it("label getText returns CLSTR·<count>", () => {
    const cluster = makeCluster({ entity_count: 7 });
    const layers = buildClusterLayer([cluster], true, false) as any[];
    const dataItem = (layers[1].props.data as any[])[0];
    const text = (layers[1].props.getText as (d: any) => string)(dataItem);
    expect(text).toBe("CLSTR·7");
  });

  it("label getPosition returns [lon, lat]", () => {
    const cluster = makeCluster({ centroid_lat: 45.5, centroid_lon: -122.6 });
    const layers = buildClusterLayer([cluster], true, false) as any[];
    const dataItem = (layers[1].props.data as any[])[0];
    const pos = (layers[1].props.getPosition as (d: any) => number[])(dataItem);
    expect(pos[0]).toBeCloseTo(-122.6);
    expect(pos[1]).toBeCloseTo(45.5);
  });
});

// ── Interaction callbacks ─────────────────────────────────────────────────────

describe("buildClusterLayer — interaction callbacks", () => {
  it("calls setHoveredEntity and setHoverPosition on hover with object", () => {
    const cluster = makeCluster();
    const setHoveredEntity = vi.fn();
    const setHoverPosition = vi.fn();

    const layers = buildClusterLayer(
      [cluster], true, false, setHoveredEntity, setHoverPosition,
    ) as any[];

    const dataItem = (layers[0].props.data as any[])[0];
    const fakeInfo = { object: dataItem, x: 100, y: 200 };
    (layers[0].props.onHover as (info: any) => void)(fakeInfo);

    expect(setHoveredEntity).toHaveBeenCalledOnce();
    const entity = setHoveredEntity.mock.calls[0][0];
    expect(entity.uid).toBe(`cluster-${cluster.cluster_id}`);
    expect(setHoverPosition).toHaveBeenCalledWith({ x: 100, y: 200 });
  });

  it("clears hover state when onHover has no object", () => {
    const setHoveredEntity = vi.fn();
    const setHoverPosition = vi.fn();

    const layers = buildClusterLayer(
      [makeCluster()], true, false, setHoveredEntity, setHoverPosition,
    ) as any[];

    (layers[0].props.onHover as (info: any) => void)({ object: null, x: 0, y: 0 });
    expect(setHoveredEntity).toHaveBeenCalledWith(null);
    expect(setHoverPosition).toHaveBeenCalledWith(null);
  });

  it("calls onEntitySelect on click with an object", () => {
    const onEntitySelect = vi.fn();

    const layers = buildClusterLayer(
      [makeCluster()], true, false, undefined, undefined, onEntitySelect,
    ) as any[];

    const dataItem = (layers[0].props.data as any[])[0];
    (layers[0].props.onClick as (info: any) => void)({ object: dataItem, x: 0, y: 0 });
    expect(onEntitySelect).toHaveBeenCalledOnce();
  });
});
