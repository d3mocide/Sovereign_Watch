import { describe, expect, it } from "vitest";
import {
  buildGraticule,
  calculateZoom,
  chaikinSmooth,
  getBearing,
  getCompensatedCenter,
  getDistanceMeters,
  maidenheadToLatLon,
  uidToHash,
} from "./geoUtils";

describe("chaikinSmooth", () => {
  it("should return original points if fewer than 3 points provided", () => {
    const empty: number[][] = [];
    const one: number[][] = [[0, 0]];
    const two: number[][] = [
      [0, 0],
      [10, 10],
    ];

    expect(chaikinSmooth(empty)).toBe(empty);
    expect(chaikinSmooth(one)).toBe(one);
    expect(chaikinSmooth(two)).toBe(two);
  });

  it("should smooth a simple 3-point line (1 iteration)", () => {
    // Triangle: (0,0) -> (10,10) -> (20,0)
    // Seg 1: (0,0) to (10,10)
    //   Q = 0.75*P0 + 0.25*P1 = (0.75*0 + 0.25*10, 0.75*0 + 0.25*10) = (2.5, 2.5)
    //   R = 0.25*P0 + 0.75*P1 = (0.25*0 + 0.75*10, 0.25*0 + 0.75*10) = (7.5, 7.5)
    // Seg 2: (10,10) to (20,0)
    //   Q = 0.75*P0 + 0.25*P1 = (0.75*10 + 0.25*20, 0.75*10 + 0.25*0) = (7.5 + 5, 7.5) = (12.5, 7.5)
    //   R = 0.25*P0 + 0.75*P1 = (0.25*10 + 0.75*20, 0.25*10 + 0.75*0) = (2.5 + 15, 2.5) = (17.5, 2.5)

    // Result should be: [Start, Seg1_Q, Seg1_R, Seg2_Q, Seg2_R, End]
    // [0,0], [2.5, 2.5], [7.5, 7.5], [12.5, 7.5], [17.5, 2.5], [20,0]

    const pts = [
      [0, 0, 0],
      [10, 10, 0],
      [20, 0, 0],
    ];
    const result = chaikinSmooth(pts, 1);

    expect(result.length).toBe(6);
    expect(result[0]).toEqual([0, 0, 0]);
    expect(result[1]).toEqual([2.5, 2.5, 0]);
    expect(result[2]).toEqual([7.5, 7.5, 0]);
    expect(result[3]).toEqual([12.5, 7.5, 0]);
    expect(result[4]).toEqual([17.5, 2.5, 0]);
    expect(result[5]).toEqual([20, 0, 0]);
  });

  it("should handle 3D coordinates correctly (Z-interpolation)", () => {
    // (0,0,0) -> (0,0,10) -> (0,0,20)
    // Straight line in Z.
    const pts = [
      [0, 0, 0],
      [0, 0, 10],
      [0, 0, 20],
    ];
    const result = chaikinSmooth(pts, 1);

    // Seg 1: 0 -> 10. Q=2.5, R=7.5
    // Seg 2: 10 -> 20. Q=12.5, R=17.5

    expect(result[1][2]).toBe(2.5);
    expect(result[2][2]).toBe(7.5);
    expect(result[3][2]).toBe(12.5);
    expect(result[4][2]).toBe(17.5);
  });

  it("should increase point count with more iterations", () => {
    const pts = [
      [0, 0, 0],
      [10, 10, 0],
      [20, 0, 0],
    ];
    const iter1 = chaikinSmooth(pts, 1);
    const iter2 = chaikinSmooth(pts, 2);

    expect(iter2.length).toBeGreaterThan(iter1.length);
    // 1 iteration: 2 segments -> 2*2 points + 2 ends = 6 points. Segments = 5.
    // 2 iterations: 5 segments -> 5*2 points + 2 ends = 12 points.
    expect(iter2.length).toBe(12);
  });

  it("should default to 2 iterations if not specified", () => {
    const pts = [
      [0, 0, 0],
      [10, 10, 0],
      [20, 0, 0],
    ];
    const result = chaikinSmooth(pts);
    expect(result.length).toBe(12);
  });
});

describe("getDistanceMeters", () => {
  it("should return 0 for same point", () => {
    expect(getDistanceMeters(0, 0, 0, 0)).toBe(0);
    expect(getDistanceMeters(45, 90, 45, 90)).toBe(0);
  });

  it("should return correct distance for known points (approx)", () => {
    // 1 degree latitude is approx 111,319 meters at equator
    const dist = getDistanceMeters(0, 0, 1, 0);
    expect(dist).toBeCloseTo(111194.9, 0);
    // Using R=6371e3, 1 deg = 2*pi*R/360 = 2*pi*6371000/360 = 111194.9266...
  });

  it("should return correct distance across equator", () => {
    // (0,0) to (0,1) -> 1 deg longitude at equator is same as 1 deg lat
    const dist = getDistanceMeters(0, 0, 0, 1);
    expect(dist).toBeCloseTo(111194.9, 0);
  });

  it("should return correct distance across pole", () => {
    // North pole (90,0) to (89,0) -> 1 deg lat
    const dist = getDistanceMeters(90, 0, 89, 0);
    expect(dist).toBeCloseTo(111194.9, 0);
  });
});

describe("getBearing", () => {
  it("should return 0 for North", () => {
    // (0,0) to (1,0)
    expect(getBearing(0, 0, 1, 0)).toBeCloseTo(0);
  });

  it("should return 90 for East", () => {
    // (0,0) to (0,1)
    expect(getBearing(0, 0, 0, 1)).toBeCloseTo(90);
  });

  it("should return 180 for South", () => {
    // (0,0) to (-1,0)
    expect(getBearing(0, 0, -1, 0)).toBeCloseTo(180);
  });

  it("should return 270 for West", () => {
    // (0,0) to (0,-1)
    expect(getBearing(0, 0, 0, -1)).toBeCloseTo(270);
  });

  it("should handle crossing the dateline", () => {
    expect(getBearing(0, 179, 0, -179)).toBeCloseTo(90);
  });

  it("should handle crossing the dateline Westward", () => {
    expect(getBearing(0, -179, 0, 179)).toBeCloseTo(270);
  });
});

describe("maidenheadToLatLon", () => {
  it("should return [0,0] for invalid input", () => {
    expect(maidenheadToLatLon("")).toEqual([0, 0]);
    expect(maidenheadToLatLon("ABC")).toEqual([0, 0]);
  });

  it("should decode 4-char grid correctly", () => {
    const [lat, lon] = maidenheadToLatLon("FN31");
    expect(lat).toBeCloseTo(41.5);
    expect(lon).toBeCloseTo(-73);
  });

  it("should decode 6-char grid correctly", () => {
    const [lat, lon] = maidenheadToLatLon("FN31pr");
    expect(lat).toBeCloseTo(41.729166, 4);
    expect(lon).toBeCloseTo(-72.708333, 4);
  });

  it("should be case insensitive", () => {
    const [lat1, lon1] = maidenheadToLatLon("fn31pr");
    const [lat2, lon2] = maidenheadToLatLon("FN31PR");
    expect(lat1).toBe(lat2);
    expect(lon1).toBe(lon2);
  });
});

describe("uidToHash", () => {
  it("should return 0 for empty uid", () => {
    expect(uidToHash("")).toBe(0);
  });

  it("should return deterministic hash", () => {
    const uid = "test-uid-123";
    const h1 = uidToHash(uid);
    const h2 = uidToHash(uid);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(0);
  });

  it("should return different hashes for different uids", () => {
    expect(uidToHash("abc")).not.toBe(uidToHash("abd"));
  });
});

describe("calculateZoom", () => {
  it("should return max zoom for small radius", () => {
    expect(calculateZoom(0.1)).toBe(14);
  });

  it("should decrease zoom for larger radius", () => {
    expect(calculateZoom(16)).toBe(10);
  });

  it("should clamp to min zoom 2", () => {
    expect(calculateZoom(10000)).toBe(2);
  });
});

describe("buildGraticule", () => {
  it("should return a FeatureCollection", () => {
    const fc = buildGraticule();
    expect(fc.type).toBe("FeatureCollection");
    expect(Array.isArray(fc.features)).toBe(true);
  });

  it("should generate lines", () => {
    const fc = buildGraticule(90);
    expect(fc.features.length).toBe(8);
  });
});

describe("getCompensatedCenter", () => {
  it("should return original coords if pitch or altitude is <= 0", () => {
    const map = { getPitch: () => 0, getBearing: () => 0, getZoom: () => 10 };
    expect(getCompensatedCenter(10, 20, 100, map)).toEqual([20, 10]);

    const map2 = { getPitch: () => 45, getBearing: () => 0, getZoom: () => 10 };
    expect(getCompensatedCenter(10, 20, 0, map2)).toEqual([20, 10]);
  });

  it("should compensate for altitude when pitch > 0", () => {
    const map = { getPitch: () => 45, getBearing: () => 0, getZoom: () => 10 };
    const [lon, lat] = getCompensatedCenter(0, 0, 1000, map);
    // 45 deg pitch -> tan(45) = 1.
    // Shift is 1000m North (bearing 0).
    // Lat shift approx 0.00899 degrees.
    expect(lon).toBeCloseTo(0);
    expect(lat).toBeGreaterThan(0);
    expect(lat).toBeCloseTo(0.00899, 5);
  });

  it("should compensate correctly for bearing 90", () => {
    const map = { getPitch: () => 45, getBearing: () => 90, getZoom: () => 10 };
    const [lon, lat] = getCompensatedCenter(0, 0, 1000, map);
    // Shift is 1000m East.
    expect(lat).toBeCloseTo(0);
    expect(lon).toBeGreaterThan(0);
    expect(lon).toBeCloseTo(0.00899, 5);
  });
});
