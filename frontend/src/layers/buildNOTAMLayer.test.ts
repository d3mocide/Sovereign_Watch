import { describe, expect, it, vi } from "vitest";
import type { FeatureCollection, Feature, Point } from "geojson";

// ── Minimal deck.gl layer stubs ───────────────────────────────────────────────
// We stub @deck.gl/layers so Vitest doesn't need WebGL in a Node environment.

vi.mock("@deck.gl/layers", () => {
  const LayerStub = class {
    id: string;
    props: Record<string, unknown>;
    constructor(props: Record<string, unknown>) {
      this.id = props.id as string;
      this.props = props;
    }
  };
  return {
    GeoJsonLayer: LayerStub,
    ScatterplotLayer: LayerStub,
    TextLayer: LayerStub,
  };
});

import { buildNOTAMLayer } from "./buildNOTAMLayer";

// ── Factories ─────────────────────────────────────────────────────────────────

const makeFeature = (category = "TFR", icao = "KORD"): Feature<Point> => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [-87.9, 41.98] },
  properties: { notam_id: "7/7894", category, icao_id: icao, keyword: "TFR" },
});

const makeFC = (features: Feature<Point>[] = [makeFeature()]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});

const baseOpts = {
  enabled: true,
  globeMode: false,
  now: 0,
  onHover: vi.fn(),
  onSelect: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildNOTAMLayer", () => {
  it("returns empty array when disabled", () => {
    const layers = buildNOTAMLayer({ ...baseOpts, data: makeFC(), enabled: false });
    expect(layers).toHaveLength(0);
  });

  it("returns empty array when data is null", () => {
    const layers = buildNOTAMLayer({ ...baseOpts, data: null });
    expect(layers).toHaveLength(0);
  });

  it("returns empty array when FeatureCollection has no features", () => {
    const layers = buildNOTAMLayer({ ...baseOpts, data: makeFC([]) });
    expect(layers).toHaveLength(0);
  });

  it("returns three layers (halo, dot, label) when data is present and enabled", () => {
    const layers = buildNOTAMLayer({ ...baseOpts, data: makeFC() });
    expect(layers).toHaveLength(3);
  });

  it("layer IDs include mercator suffix in 2D mode", () => {
    const layers = buildNOTAMLayer({ ...baseOpts, data: makeFC() });
    const ids = layers.map((l: any) => l.id);
    expect(ids.every((id: string) => id.includes("merc"))).toBe(true);
  });

  it("layer IDs include globe suffix in globe mode", () => {
    const layers = buildNOTAMLayer({
      ...baseOpts,
      data: makeFC(),
      globeMode: true,
    });
    const ids = layers.map((l: any) => l.id);
    expect(ids.every((id: string) => id.includes("globe"))).toBe(true);
  });

  it("dot layer is pickable, halo layer is not", () => {
    const layers = buildNOTAMLayer({ ...baseOpts, data: makeFC() });
    const halo = layers.find((l: any) => l.id.includes("halo")) as any;
    const dot  = layers.find((l: any) => l.id.includes("dot")) as any;
    expect(halo.props.pickable).toBe(false);
    expect(dot.props.pickable).toBe(true);
  });

  it("dot layer has onHover and onClick handlers attached", () => {
    const onHover = vi.fn();
    const onSelect = vi.fn();
    const layers = buildNOTAMLayer({
      ...baseOpts,
      data: makeFC(),
      onHover,
      onSelect,
    });
    const dot = layers.find((l: any) => l.id.includes("dot")) as any;
    expect(dot.props.onHover).toBe(onHover);
    expect(dot.props.onClick).toBe(onSelect);
  });

  it("handles unknown category gracefully (falls back to OTHER color)", () => {
    const fc = makeFC([makeFeature("UNKNOWN_CATEGORY")]);
    expect(() => buildNOTAMLayer({ ...baseOpts, data: fc })).not.toThrow();
  });
});
