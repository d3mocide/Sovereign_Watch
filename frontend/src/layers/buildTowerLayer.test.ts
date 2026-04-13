/**
 * Unit tests for buildTowerLayer.
 *
 * ScatterplotLayer is mocked so tests run without WebGL.
 * Covers guard conditions, layer properties, globe/mercator ID variation,
 * and the normalizeTowerInfo pick-info shape (exercised via onHover/onClick).
 */

import { describe, expect, it, vi } from "vitest";
import type { Tower } from "../types";

// ── deck.gl mock ──────────────────────────────────────────────────────────────

vi.mock("@deck.gl/layers", () => {
  class ScatterplotLayer {
    id: string;
    props: Record<string, unknown>;
    constructor(props: Record<string, unknown>) {
      this.id = props.id as string;
      this.props = props;
    }
  }
  return { ScatterplotLayer };
});

import { buildTowerLayer } from "./buildTowerLayer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTower(overrides: Partial<Tower> = {}): Tower {
  return {
    id: "tower-1",
    fccId: "FCC-001",
    type: "AM",
    owner: "Test Corp",
    status: "active",
    heightM: 100,
    elevationM: 50,
    coordinates: [-122.6784, 45.5152],
    lat: 45.5152,
    lon: -122.6784,
    ...overrides,
  } as Tower;
}

// ── Guard conditions ──────────────────────────────────────────────────────────

describe("buildTowerLayer — guard conditions", () => {
  const noop = () => {};

  it("returns empty array when visible=false", () => {
    expect(buildTowerLayer([makeTower()], false, false, noop, noop)).toEqual([]);
  });

  it("returns empty array when towers array is empty", () => {
    expect(buildTowerLayer([], true, false, noop, noop)).toEqual([]);
  });

  it("returns empty array when towers is null/undefined", () => {
    expect(buildTowerLayer(null as unknown as Tower[], true, false, noop, noop)).toEqual([]);
  });
});

// ── Layer structure ───────────────────────────────────────────────────────────

describe("buildTowerLayer — layer structure", () => {
  const noop = () => {};
  const towers = [makeTower()];

  it("returns exactly one layer", () => {
    expect(buildTowerLayer(towers, true, false, noop, noop)).toHaveLength(1);
  });

  it("layer id contains 'fcc-towers-layer'", () => {
    const layers = buildTowerLayer(towers, true, false, noop, noop) as any[];
    expect(layers[0].id).toContain("fcc-towers-layer");
  });

  it("layer id ends with 'merc' in mercator mode", () => {
    const layers = buildTowerLayer(towers, true, false, noop, noop) as any[];
    expect(layers[0].id).toContain("merc");
  });

  it("layer id ends with 'globe' in globe mode", () => {
    const layers = buildTowerLayer(towers, true, true, noop, noop) as any[];
    expect(layers[0].id).toContain("globe");
  });

  it("layer is pickable", () => {
    const layers = buildTowerLayer(towers, true, false, noop, noop) as any[];
    expect(layers[0].props.pickable).toBe(true);
  });

  it("wrapLongitude is true in mercator mode", () => {
    const layers = buildTowerLayer(towers, true, false, noop, noop) as any[];
    expect(layers[0].props.wrapLongitude).toBe(true);
  });

  it("wrapLongitude is false in globe mode", () => {
    const layers = buildTowerLayer(towers, true, true, noop, noop) as any[];
    expect(layers[0].props.wrapLongitude).toBe(false);
  });

  it("getPosition accessor returns tower coordinates", () => {
    const tower = makeTower({ coordinates: [-122.6784, 45.5152] });
    const layers = buildTowerLayer([tower], true, false, noop, noop) as any[];
    const pos = (layers[0].props.getPosition as (d: Tower) => number[])(tower);
    expect(pos).toEqual([-122.6784, 45.5152]);
  });
});

// ── normalizeTowerInfo via onHover/onClick ────────────────────────────────────

describe("buildTowerLayer — normalizeTowerInfo (via callbacks)", () => {
  it("onHover emits normalized object with tower properties", () => {
    const tower = makeTower({ fccId: "FCC-999", owner: "Test Inc" });
    const onHover = vi.fn();

    const layers = buildTowerLayer([tower], true, false, onHover, vi.fn()) as any[];
    const fakeInfo = {
      object: tower,
      coordinate: [-122.6784, 45.5152],
      x: 100,
      y: 200,
    };
    (layers[0].props.onHover as (info: any) => void)(fakeInfo);

    expect(onHover).toHaveBeenCalledOnce();
    const normalized = onHover.mock.calls[0][0];
    expect(normalized.object.properties.fcc_id).toBe("FCC-999");
    expect(normalized.object.properties.owner).toBe("Test Inc");
    expect(normalized.object.properties.entity_type).toBe("tower");
    expect(normalized.object.properties.source).toBe("FCC");
    expect(normalized.object.type).toBe("tower");
  });

  it("onHover with no tower object returns coordinate-only shape", () => {
    const onHover = vi.fn();

    const layers = buildTowerLayer([makeTower()], true, false, onHover, vi.fn()) as any[];
    (layers[0].props.onHover as (info: any) => void)({
      object: undefined,
      coordinate: [-122.0, 45.0],
      x: 10,
      y: 20,
    });

    const normalized = onHover.mock.calls[0][0];
    expect(normalized.object).toBeUndefined();
    expect(normalized.x).toBe(10);
  });

  it("onClick calls onSelect with normalized info when object present", () => {
    const onSelect = vi.fn();
    const tower = makeTower();

    const layers = buildTowerLayer([tower], true, false, vi.fn(), onSelect) as any[];
    const fakeInfo = { object: tower, coordinate: [-122.0, 45.0], x: 5, y: 5 };
    (layers[0].props.onClick as (info: any) => void)(fakeInfo);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0][0].object.properties.entity_type).toBe("tower");
  });

  it("onClick does not call onSelect when no object", () => {
    const onSelect = vi.fn();

    const layers = buildTowerLayer([makeTower()], true, false, vi.fn(), onSelect) as any[];
    (layers[0].props.onClick as (info: any) => void)({
      object: undefined,
      coordinate: [-122.0, 45.0],
      x: 5,
      y: 5,
    });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("normalizes coordinate when it is an array", () => {
    const onHover = vi.fn();
    const tower = makeTower();

    const layers = buildTowerLayer([tower], true, false, onHover, vi.fn()) as any[];
    (layers[0].props.onHover as (info: any) => void)({
      object: tower,
      coordinate: [-122.6784, 45.5152],
      x: 0,
      y: 0,
    });

    const normalized = onHover.mock.calls[0][0];
    expect(normalized.coordinate).toEqual([-122.6784, 45.5152]);
  });
});
