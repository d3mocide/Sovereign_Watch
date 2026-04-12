/**
 * Unit tests for buildH3RiskLayer.
 *
 * H3HexagonLayer is mocked so these tests run without WebGL.
 * They verify guard conditions, layer structure, and the severity→colour mapping.
 */

import { describe, expect, it, vi } from "vitest";
import type { H3RiskCellData } from "../api/h3Risk";

// ── deck.gl mock ──────────────────────────────────────────────────────────────

vi.mock("@deck.gl/geo-layers", () => {
  class H3HexagonLayer {
    id: string;
    props: Record<string, unknown>;
    constructor(props: Record<string, unknown>) {
      this.id = props.id as string;
      this.props = props;
    }
  }
  return { H3HexagonLayer };
});

import { buildH3RiskLayer } from "./buildH3RiskLayer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCell(
  cell: string,
  severity: H3RiskCellData["severity"] = "LOW",
): H3RiskCellData {
  return { cell, severity, lat: 45.5, lon: -122.6, density: 1, sentiment: 0, risk_score: 10 };
}

// ── Guard conditions ──────────────────────────────────────────────────────────

describe("buildH3RiskLayer — guard conditions", () => {
  it("returns empty array when visible=false", () => {
    const cells = [makeCell("8928308280fffff", "HIGH")];
    expect(buildH3RiskLayer(cells, false)).toEqual([]);
  });

  it("returns empty array when cells array is empty (even if visible)", () => {
    expect(buildH3RiskLayer([], true)).toEqual([]);
  });

  it("returns empty array when both visible=false and cells are empty", () => {
    expect(buildH3RiskLayer([], false)).toEqual([]);
  });
});

// ── Layer structure ───────────────────────────────────────────────────────────

describe("buildH3RiskLayer — layer structure", () => {
  const cells = [makeCell("8928308280fffff", "MEDIUM")];

  it("returns exactly one layer", () => {
    expect(buildH3RiskLayer(cells, true)).toHaveLength(1);
  });

  it("layer has id 'h3-risk-layer'", () => {
    const layers = buildH3RiskLayer(cells, true) as any[];
    expect(layers[0].id).toBe("h3-risk-layer");
  });

  it("layer is not pickable", () => {
    const layers = buildH3RiskLayer(cells, true) as any[];
    expect(layers[0].props.pickable).toBe(false);
  });

  it("layer is filled and not extruded", () => {
    const layers = buildH3RiskLayer(cells, true) as any[];
    expect(layers[0].props.filled).toBe(true);
    expect(layers[0].props.extruded).toBe(false);
  });

  it("passes cells as data", () => {
    const layers = buildH3RiskLayer(cells, true) as any[];
    expect(layers[0].props.data).toBe(cells);
  });

  it("getHexagon accessor returns cell id", () => {
    const layers = buildH3RiskLayer(cells, true) as any[];
    const result = (layers[0].props.getHexagon as (d: H3RiskCellData) => string)(
      cells[0],
    );
    expect(result).toBe("8928308280fffff");
  });
});

// ── Severity colour mapping ────────────────────────────────────────────────────

describe("buildH3RiskLayer — severity colour mapping via getFillColor", () => {
  const COLORS: Record<string, [number, number, number, number]> = {
    LOW:      [0,   200, 100, 40],
    MEDIUM:   [255, 200, 0,   110],
    HIGH:     [255, 100, 0,   160],
    CRITICAL: [255, 0,   50,  220],
  };

  for (const [severity, expected] of Object.entries(COLORS)) {
    it(`maps severity ${severity} to the correct RGBA tuple`, () => {
      const cell = makeCell("abc", severity as H3RiskCellData["severity"]);
      const layers = buildH3RiskLayer([cell], true) as any[];
      const color = (layers[0].props.getFillColor as (d: H3RiskCellData) => number[])(cell);
      expect(color).toEqual(expected);
    });
  }

  it("falls back to LOW colour when severity is undefined", () => {
    const cell = { cell: "abc", lat: 0, lon: 0, density: 0, sentiment: 0, risk_score: 0 } as unknown as H3RiskCellData;
    const layers = buildH3RiskLayer([cell], true) as any[];
    const color = (layers[0].props.getFillColor as (d: H3RiskCellData) => number[])(cell);
    expect(color).toEqual(COLORS.LOW);
  });
});
