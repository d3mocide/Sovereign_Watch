/**
 * Regression test for the globe-view terminator rendering bug: the polygon's
 * pole-closing edges must stay finely sampled, or they render as long straight
 * chords cutting across the sphere on globe/3D projections (harmless on flat
 * Mercator maps, which don't care about edge length).
 */

import { describe, expect, it } from "vitest";

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

import { vi } from "vitest";
import { getTerminatorLayer } from "./TerminatorLayer";

describe("getTerminatorLayer", () => {
  it("keeps every edge of the night polygon within a small lat/lon step", () => {
    const layer = getTerminatorLayer(true) as unknown as {
      props: { data: { features: [{ geometry: { coordinates: number[][][] } }] } };
    };
    const ring = layer.props.data.features[0].geometry.coordinates[0];

    const MAX_STEP_DEG = 5;
    for (let i = 1; i < ring.length; i++) {
      const [lon0, lat0] = ring[i - 1];
      const [lon1, lat1] = ring[i];
      const latStep = Math.abs(lat1 - lat0);
      expect(latStep).toBeLessThanOrEqual(MAX_STEP_DEG);

      // A lon jump is only harmless when both endpoints sit at the same pole
      // (every longitude maps to the same 3D point there, so it's a
      // zero-length edge regardless of the lon delta).
      const bothAtSamePole = Math.abs(lat0) === 90 && lat0 === lat1;
      if (!bothAtSamePole) {
        expect(Math.abs(lon1 - lon0)).toBeLessThanOrEqual(MAX_STEP_DEG);
      }
    }
  });
});
