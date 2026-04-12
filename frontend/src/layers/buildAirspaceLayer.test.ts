/**
 * Unit tests for buildAirspaceLayer.
 *
 * deck.gl is mocked so tests run in a plain Node environment (no WebGL).
 */

import { describe, expect, it, vi } from "vitest";
import type { FeatureCollection } from "geojson";

// ── deck.gl mock ──────────────────────────────────────────────────────────────

vi.mock("@deck.gl/layers", () => {
  class GeoJsonLayer {
    id: string;
    props: Record<string, unknown>;
    constructor(props: Record<string, unknown>) {
      this.id = props.id as string;
      this.props = props;
    }
  }
  return { GeoJsonLayer };
});

import { buildAirspaceLayer } from "./buildAirspaceLayer";

// ── Helpers ───────────────────────────────────────────────────────────────────

const noop = () => {};

function makeFC(type = "RESTRICTED"): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-87.5, 41.5],
              [-87.5, 42.5],
              [-88.5, 42.5],
              [-88.5, 41.5],
              [-87.5, 41.5],
            ],
          ],
        },
        properties: { zone_id: "abc123", type, country: "US" },
      },
    ],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildAirspaceLayer — guard conditions", () => {
  it("returns empty array when disabled", () => {
    const layers = buildAirspaceLayer({
      data: makeFC(),
      enabled: false,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    expect(layers).toEqual([]);
  });

  it("returns empty array when data is null", () => {
    const layers = buildAirspaceLayer({
      data: null,
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    expect(layers).toEqual([]);
  });

  it("returns empty array when FeatureCollection has no features", () => {
    const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
    const layers = buildAirspaceLayer({
      data: empty,
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    expect(layers).toEqual([]);
  });
});

describe("buildAirspaceLayer — layer creation", () => {
  it("returns exactly one GeoJsonLayer when enabled with data", () => {
    const layers = buildAirspaceLayer({
      data: makeFC(),
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    expect(layers).toHaveLength(1);
  });

  it("layer ID contains 'airspace-zones'", () => {
    const layers = buildAirspaceLayer({
      data: makeFC(),
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    const layer = layers[0] as any;
    expect(layer.id).toContain("airspace-zones");
  });

  it("layer ID ends with 'merc' in flat map mode", () => {
    const layers = buildAirspaceLayer({
      data: makeFC(),
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    const layer = layers[0] as any;
    expect(layer.id).toMatch(/merc$/);
  });

  it("layer ID ends with 'globe' in globe mode", () => {
    const layers = buildAirspaceLayer({
      data: makeFC(),
      enabled: true,
      globeMode: true,
      onHover: noop,
      onSelect: noop,
    });
    const layer = layers[0] as any;
    expect(layer.id).toMatch(/globe$/);
  });

  it("layer is pickable", () => {
    const layers = buildAirspaceLayer({
      data: makeFC(),
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    const layer = layers[0] as any;
    expect(layer.props.pickable).toBe(true);
  });

  it("layer has stroked and filled enabled", () => {
    const layers = buildAirspaceLayer({
      data: makeFC(),
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    const layer = layers[0] as any;
    expect(layer.props.stroked).toBe(true);
    expect(layer.props.filled).toBe(true);
  });

  it("onClick is bound to onSelect handler", () => {
    const handler = vi.fn();
    const layers = buildAirspaceLayer({
      data: makeFC(),
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: handler,
    });
    const layer = layers[0] as any;
    expect(layer.props.onClick).toBe(handler);
  });

  it("onHover is bound to onHover handler", () => {
    const handler = vi.fn();
    const layers = buildAirspaceLayer({
      data: makeFC(),
      enabled: true,
      globeMode: false,
      onHover: handler,
      onSelect: noop,
    });
    const layer = layers[0] as any;
    expect(layer.props.onHover).toBe(handler);
  });
});

describe("buildAirspaceLayer — colour functions", () => {
  it("getFillColor returns a 4-element RGBA array for a known type", () => {
    const layers = buildAirspaceLayer({
      data: makeFC("RESTRICTED"),
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    const layer = layers[0] as any;
    const feature = makeFC("RESTRICTED").features[0];
    const color: [number, number, number, number] = layer.props.getFillColor(feature);
    expect(color).toHaveLength(4);
    // RESTRICTED is orange-500 (#f97316) → [249, 115, 22, 45]
    expect(color[0]).toBe(249);
    expect(color[1]).toBe(115);
    expect(color[2]).toBe(22);
    expect(color[3]).toBe(45); // TYPE_FILL_ALPHA
  });

  it("getLineColor returns a 4-element RGBA array with higher alpha", () => {
    const layers = buildAirspaceLayer({
      data: makeFC("RESTRICTED"),
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    const layer = layers[0] as any;
    const feature = makeFC("RESTRICTED").features[0];
    const color: [number, number, number, number] = layer.props.getLineColor(feature);
    expect(color[3]).toBe(200); // TYPE_LINE_ALPHA
  });

  it("getFillColor falls back to slate-400 for unknown type", () => {
    const layers = buildAirspaceLayer({
      data: makeFC("UNKNOWN_TYPE"),
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    const layer = layers[0] as any;
    const feature = makeFC("UNKNOWN_TYPE").features[0];
    const color: [number, number, number, number] = layer.props.getFillColor(feature);
    // slate-400 fallback is #94a3b8 → [148, 163, 184]
    expect(color[0]).toBe(148);
    expect(color[1]).toBe(163);
    expect(color[2]).toBe(184);
  });

  it("respects explicit 'color' property on feature over type lookup", () => {
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [[[-87.5, 41.5], [-87.5, 42.5], [-88.5, 42.5], [-87.5, 41.5]]] },
          properties: { zone_id: "x1", type: "RESTRICTED", color: "#ff0000" },
        },
      ],
    };
    const layers = buildAirspaceLayer({
      data: fc,
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    const layer = layers[0] as any;
    const feature = fc.features[0];
    const color: [number, number, number, number] = layer.props.getFillColor(feature);
    // #ff0000 → [255, 0, 0, 45]
    expect(color[0]).toBe(255);
    expect(color[1]).toBe(0);
    expect(color[2]).toBe(0);
  });
});

describe("buildAirspaceLayer — globe mode parameters", () => {
  it("depthTest is false in flat map mode", () => {
    const layers = buildAirspaceLayer({
      data: makeFC(),
      enabled: true,
      globeMode: false,
      onHover: noop,
      onSelect: noop,
    });
    const layer = layers[0] as any;
    expect(layer.props.parameters.depthTest).toBe(false);
  });

  it("depthTest is true in globe mode", () => {
    const layers = buildAirspaceLayer({
      data: makeFC(),
      enabled: true,
      globeMode: true,
      onHover: noop,
      onSelect: noop,
    });
    const layer = layers[0] as any;
    expect(layer.props.parameters.depthTest).toBe(true);
  });

  it("depthMask is always false (so entity chevrons show above)", () => {
    for (const globeMode of [false, true]) {
      const layers = buildAirspaceLayer({
        data: makeFC(),
        enabled: true,
        globeMode,
        onHover: noop,
        onSelect: noop,
      });
      const layer = layers[0] as any;
      expect(layer.props.parameters.depthMask).toBe(false);
    }
  });
});
