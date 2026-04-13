// @vitest-environment jsdom
/**
 * Unit tests for useMissionHash utility functions.
 *
 * parseMissionHash reads window.location.hash; updateMissionHash writes via
 * window.history.replaceState.  Both are exported as plain functions.
 *
 * The module carries state in file-level `memory*` variables, so each
 * describe block that calls updateMissionHash uses vi.resetModules() +
 * dynamic import to get a fresh module instance with zeroed-out state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// parseMissionHash — tested against the static import (no module state used)
// ---------------------------------------------------------------------------

import { parseMissionHash } from "./useMissionHash";

describe("parseMissionHash — empty / missing hash", () => {
  it("returns nulls and empty layers when hash is absent", () => {
    window.location.hash = "";
    const result = parseMissionHash();
    expect(result).toEqual({ lat: null, lon: null, zoom: null, activeLayers: [] });
  });

  it("returns nulls when hash is bare #", () => {
    window.location.hash = "#";
    expect(parseMissionHash()).toEqual({
      lat: null,
      lon: null,
      zoom: null,
      activeLayers: [],
    });
  });
});

describe("parseMissionHash — valid hashes", () => {
  it("parses lat, lon, zoom correctly", () => {
    window.location.hash = "#45.5152,-122.6784,9.5";
    const result = parseMissionHash();
    expect(result.lat).toBeCloseTo(45.5152);
    expect(result.lon).toBeCloseTo(-122.6784);
    expect(result.zoom).toBeCloseTo(9.5);
    expect(result.activeLayers).toEqual([]);
  });

  it("parses active layers after zoom", () => {
    window.location.hash = "#45.5152,-122.6784,9.5,showAir,showSea";
    const result = parseMissionHash();
    expect(result.activeLayers).toEqual(["showAir", "showSea"]);
  });

  it("handles negative lat (southern hemisphere)", () => {
    window.location.hash = "#-33.8688,151.2093,10.0";
    const result = parseMissionHash();
    expect(result.lat).toBeCloseTo(-33.8688);
    expect(result.lon).toBeCloseTo(151.2093);
  });

  it("handles single active layer", () => {
    window.location.hash = "#45.5,-122.6,8.0,showOrbital";
    expect(parseMissionHash().activeLayers).toEqual(["showOrbital"]);
  });
});

describe("parseMissionHash — malformed hashes", () => {
  it("returns null for non-numeric lat", () => {
    window.location.hash = "#abc,-122.6784,9.5";
    expect(parseMissionHash().lat).toBeNull();
  });

  it("returns null for non-numeric lon", () => {
    window.location.hash = "#45.5,xyz,9.5";
    expect(parseMissionHash().lon).toBeNull();
  });

  it("returns null for non-numeric zoom", () => {
    window.location.hash = "#45.5,-122.6,bad";
    expect(parseMissionHash().zoom).toBeNull();
  });

  it("still parses layers even when coords are NaN", () => {
    window.location.hash = "#abc,xyz,bad,showAir";
    const result = parseMissionHash();
    expect(result.lat).toBeNull();
    expect(result.activeLayers).toEqual(["showAir"]);
  });
});

// ---------------------------------------------------------------------------
// updateMissionHash — each describe uses a fresh module to avoid shared state
// ---------------------------------------------------------------------------

describe("updateMissionHash — writes hash after debounce", () => {
  let updateMissionHash: typeof import("./useMissionHash").updateMissionHash;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    window.location.hash = "";
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    ({ updateMissionHash } = await import("./useMissionHash"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes lat/lon/zoom into the hash fragment", () => {
    updateMissionHash({ lat: 45.5152, lon: -122.6784, zoom: 9.5 });
    vi.runAllTimers();
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      expect.stringMatching(/45\.5152,-122\.6784,9\.50/),
    );
  });

  it("encodes active filter keys (show*=true) into the hash", () => {
    updateMissionHash(
      { lat: 45.5152, lon: -122.6784, zoom: 9.5 },
      { showAir: true, showSea: true, showOrbital: false },
    );
    vi.runAllTimers();
    const url = (
      window.history.replaceState as ReturnType<typeof vi.fn>
    ).mock.calls[0][2] as string;
    expect(url).toContain("showAir");
    expect(url).toContain("showSea");
    expect(url).not.toContain("showOrbital");
  });
});

describe("updateMissionHash — no-op cases", () => {
  let updateMissionHash: typeof import("./useMissionHash").updateMissionHash;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    window.location.hash = "";
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    ({ updateMissionHash } = await import("./useMissionHash"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not write hash when coordinates are null", () => {
    // No prior hash, no viewState → all coords null → no replaceState call
    updateMissionHash(undefined, { showAir: true });
    vi.runAllTimers();
    expect(window.history.replaceState).not.toHaveBeenCalled();
  });

  it("does not replace state when hash would be unchanged", () => {
    // Pre-set the hash to exactly what the update would produce
    window.location.hash = "#45.5152,-122.6784,9.50";
    updateMissionHash({ lat: 45.5152, lon: -122.6784, zoom: 9.5 });
    vi.runAllTimers();
    expect(window.history.replaceState).not.toHaveBeenCalled();
  });
});
