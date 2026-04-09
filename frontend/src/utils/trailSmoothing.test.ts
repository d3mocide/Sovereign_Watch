import { describe, expect, it } from "vitest";
import { getSmoothedTrail } from "./trailSmoothing";
import type { CoTEntity, TrailPoint } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeTrail = (): TrailPoint[] => [
  [-74, 40, 0, 10],
  [-73.9, 40.1, 100, 10],
  [-73.8, 40.2, 200, 10],
];

const makeEntity = (overrides: Partial<CoTEntity> = {}): CoTEntity => ({
  uid: "e-1",
  lat: 40,
  lon: -74,
  altitude: 0,
  type: "a-f-A",
  course: 0,
  speed: 0,
  callsign: "TEST",
  lastSeen: Date.now(),
  trail: [],
  uidHash: 1,
  ...overrides,
});

// ─── Cache hit ────────────────────────────────────────────────────────────────

describe("getSmoothedTrail — cache hit", () => {
  it("should return the cached smoothedTrail when trail reference matches", () => {
    const trail = makeTrail();
    const cachedResult = [[0, 0, 0], [1, 1, 0]];
    const entity = makeEntity({ trail, smoothedTrail: cachedResult });

    const result = getSmoothedTrail(trail, entity);

    expect(result).toBe(cachedResult); // same reference = cache hit
  });

  it("should NOT use cache when trail reference has changed", () => {
    const trail = makeTrail();
    const differentTrail = makeTrail(); // new reference
    const cachedResult = [[0, 0, 0]];
    const entity = makeEntity({ trail: differentTrail, smoothedTrail: cachedResult });

    // Pass original trail but entity holds a different trail reference
    const result = getSmoothedTrail(trail, entity);

    expect(result).not.toBe(cachedResult);
  });
});

// ─── Cache miss — smoothing ───────────────────────────────────────────────────

describe("getSmoothedTrail — cache miss", () => {
  it("should compute smoothed trail for a trail with 3+ points", () => {
    const trail = makeTrail();
    const result = getSmoothedTrail(trail, undefined);

    // chaikinSmooth on 3 points (2 segments) with default 2 iterations → 12 points
    expect(result.length).toBeGreaterThan(trail.length);
    expect(Array.isArray(result)).toBe(true);
  });

  it("should return empty array for trail with fewer than 2 points", () => {
    const singlePoint: TrailPoint[] = [[-74, 40, 0, 10]];
    expect(getSmoothedTrail(singlePoint, undefined)).toEqual([]);
  });

  it("should return empty array for empty trail", () => {
    expect(getSmoothedTrail([], undefined)).toEqual([]);
  });

  it("should return smoothed trail for exactly 2 points", () => {
    const twoPoints: TrailPoint[] = [
      [-74, 40, 0, 10],
      [-73, 41, 100, 10],
    ];
    const result = getSmoothedTrail(twoPoints, undefined);
    // chaikinSmooth returns original array for < 3 points
    expect(result).toEqual(twoPoints.map((p) => [p[0], p[1], p[2]]));
  });

  it("should return a new computation when existing entity has no smoothedTrail", () => {
    const trail = makeTrail();
    const entity = makeEntity({ trail, smoothedTrail: undefined });

    const result = getSmoothedTrail(trail, entity);

    expect(result.length).toBeGreaterThan(trail.length);
  });
});
