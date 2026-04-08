import { describe, expect, it } from "vitest";
import { interpolatePVB } from "./interpolation";
import type { CoTEntity, DRState, VisualState } from "../types";

// ─── Factories ────────────────────────────────────────────────────────────────

const makeEntity = (overrides: Partial<CoTEntity> = {}): CoTEntity => ({
  uid: "e-1",
  lat: 40.0,
  lon: -74.0,
  altitude: 10000,
  type: "a-f-A",
  course: 0,
  speed: 0,
  callsign: "TEST01",
  lastSeen: Date.now(),
  trail: [],
  uidHash: 1,
  ...overrides,
});

const makeDR = (overrides: Partial<DRState> = {}): DRState => ({
  serverLat: 40.0,
  serverLon: -74.0,
  serverSpeed: 0,
  serverCourseRad: 0,
  serverTime: Date.now() - 1000,
  blendLat: 40.0,
  blendLon: -74.0,
  blendSpeed: 0,
  blendCourseRad: 0,
  expectedInterval: 5000,
  ...overrides,
});

const makeVisual = (overrides: Partial<VisualState> = {}): VisualState => ({
  lat: 40.0,
  lon: -74.0,
  alt: 10000,
  ...overrides,
});

// ─── No DR, no prior visual state ────────────────────────────────────────────

describe("interpolatePVB — no DR, no prior visual", () => {
  it("should create a new VisualState at the entity position", () => {
    const entity = makeEntity({ lat: 51.5, lon: -0.1, altitude: 5000, speed: 0 });
    const { visual, interpolatedEntity } = interpolatePVB(entity, undefined, undefined, Date.now(), 16);

    expect(visual.lat).toBe(51.5);
    expect(visual.lon).toBe(-0.1);
    expect(visual.alt).toBe(5000);
    expect(interpolatedEntity.lat).toBe(51.5);
    expect(interpolatedEntity.lon).toBe(-0.1);
  });

  it("should preserve entity course when no DR is provided", () => {
    const entity = makeEntity({ course: 135, speed: 0 });
    const { interpolatedEntity } = interpolatePVB(entity, undefined, undefined, Date.now(), 16);
    expect(interpolatedEntity.course).toBe(135);
  });
});

// ─── No DR, with prior visual state ──────────────────────────────────────────

describe("interpolatePVB — no DR, with prior visual", () => {
  it("should smooth visual position toward entity target", () => {
    const entity = makeEntity({ lat: 41.0, lon: -73.0, altitude: 10000, speed: 0 });
    const visual = makeVisual({ lat: 40.0, lon: -74.0, alt: 10000 });
    const now = Date.now();

    const { visual: newVisual } = interpolatePVB(entity, undefined, visual, now, 16.67);

    // With dt=16.67ms and baseAlpha=0.25: smoothFactor ≈ 0.25
    // newLat = 40 + (41 - 40) * 0.25 = 40.25
    expect(newVisual.lat).toBeCloseTo(40.25, 4);
    // newLon = -74 + (-73 - -74) * 0.25 = -73.75
    expect(newVisual.lon).toBeCloseTo(-73.75, 4);
  });

  it("should clamp to target when already very close", () => {
    const entity = makeEntity({ lat: 40.0000001, lon: -74.0, altitude: 10000, speed: 0 });
    const visual = makeVisual({ lat: 40.0, lon: -74.0, alt: 10000 });

    const { visual: newVisual } = interpolatePVB(entity, undefined, visual, Date.now(), 16.67);

    // Within 0.000001 degrees tolerance → should snap
    expect(newVisual.lat).toBe(40.0000001);
    expect(newVisual.lon).toBe(-74.0);
  });

  it("should smooth altitude toward entity altitude", () => {
    const entity = makeEntity({ lat: 40.0, lon: -74.0, altitude: 11000, speed: 0 });
    const visual = makeVisual({ lat: 40.0, lon: -74.0, alt: 10000 });

    const { visual: newVisual } = interpolatePVB(entity, undefined, visual, Date.now(), 16.67);

    // alt = 10000 + (11000 - 10000) * 0.25 = 10250
    expect(newVisual.alt).toBeCloseTo(10250, 0);
  });
});

// ─── With DR, zero speed ──────────────────────────────────────────────────────

describe("interpolatePVB — DR present, speed ≤ 0.5 (no dead reckoning)", () => {
  it("should use entity position directly (no projection) for very slow entities", () => {
    const entity = makeEntity({ lat: 40.0, lon: -74.0, altitude: 0, speed: 0.5 });
    const dr = makeDR({ serverLat: 39.0, serverLon: -75.0, serverSpeed: 10 });
    // speed ≤ 0.5 → DR is skipped; target = entity position
    const { visual: newVisual } = interpolatePVB(entity, dr, undefined, Date.now(), 16);

    expect(newVisual.lat).toBe(40.0);
    expect(newVisual.lon).toBe(-74.0);
  });
});

// ─── With DR, moving entity ───────────────────────────────────────────────────

describe("interpolatePVB — DR present, speed > 0.5", () => {
  it("should project entity position northward over time", () => {
    const now = Date.now();
    // Aircraft at (0,0) moving north at 100 m/s
    const entity = makeEntity({ lat: 0.0, lon: 0.0, altitude: 10000, speed: 100 });
    const dr = makeDR({
      serverLat: 0.0,
      serverLon: 0.0,
      serverSpeed: 100, // m/s
      serverCourseRad: 0, // North
      serverTime: now - 1000, // 1 second ago
      blendLat: 0.0,
      blendLon: 0.0,
      blendSpeed: 100,
      blendCourseRad: 0,
      expectedInterval: 5000,
    });

    const { visual: newVisual } = interpolatePVB(entity, dr, undefined, now, 16);

    // After 1 second heading north at 100 m/s, latitude should increase
    expect(newVisual.lat).toBeGreaterThan(0);
    // Longitude should remain near 0 (heading due north)
    expect(newVisual.lon).toBeCloseTo(0, 4);
  });

  it("should use DR-derived course in interpolated entity", () => {
    const now = Date.now();
    const entity = makeEntity({ lat: 0.0, lon: 0.0, altitude: 0, speed: 100, course: 0 });
    const dr = makeDR({
      serverLat: 0.0,
      serverLon: 0.0,
      serverSpeed: 100,
      serverCourseRad: Math.PI / 2, // East (90 degrees)
      serverTime: now - 1000,
      blendLat: 0.0,
      blendLon: 0.0,
      blendSpeed: 100,
      blendCourseRad: Math.PI / 2,
      expectedInterval: 5000,
    });

    const { interpolatedEntity } = interpolatePVB(entity, dr, undefined, now, 16);

    // blendCourseRad = π/2 → course = (90 + 360) % 360 = 90
    expect(interpolatedEntity.course).toBeCloseTo(90, 0);
  });

  it("should derive course from dr.blendCourseRad", () => {
    const now = Date.now();
    const entity = makeEntity({ lat: 0, lon: 0, altitude: 0, speed: 100, course: 90 });
    const dr = makeDR({
      serverLat: 0,
      serverLon: 0,
      serverSpeed: 100,
      serverCourseRad: (45 * Math.PI) / 180,
      serverTime: now - 1000,
      blendLat: 0,
      blendLon: 0,
      blendSpeed: 100,
      blendCourseRad: (270 * Math.PI) / 180, // West
      expectedInterval: 5000,
    });

    const { interpolatedEntity } = interpolatePVB(entity, dr, undefined, now, 16);

    // course = ((dr.blendCourseRad * 180/π) + 360) % 360
    const expected = ((270 + 360) % 360); // = 270
    expect(interpolatedEntity.course).toBeCloseTo(expected, 0);
  });

  it("should cap smoothDt at 33ms so very large frames behave like 33ms frames", () => {
    const now = Date.now();
    const entity = makeEntity({ lat: 40.0, lon: -74.0, altitude: 10000, speed: 0 });
    const visual = makeVisual({ lat: 39.0, lon: -75.0, alt: 9000 });

    // Both dt=33ms and dt=10000ms should produce identical results because smoothDt = min(dt, 33)
    const { visual: newVisual33 } = interpolatePVB(entity, undefined, visual, now, 33);
    const { visual: newVisualHuge } = interpolatePVB(entity, undefined, visual, now, 10000);

    expect(newVisualHuge.lat).toBeCloseTo(newVisual33.lat, 8);
    expect(newVisualHuge.lon).toBeCloseTo(newVisual33.lon, 8);
  });
});
