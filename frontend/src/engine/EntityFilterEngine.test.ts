import { describe, expect, it } from "vitest";
import {
  STALE_THRESHOLD_AIR_MS,
  STALE_THRESHOLD_SEA_MS,
  processEntityFrame,
  processReplayFrame,
} from "./EntityFilterEngine";
import type { CoTEntity, MapFilters, VisualState } from "../types";

// ─── Factories ────────────────────────────────────────────────────────────────

const makeAircraft = (uid: string, lastSeen: number, overrides: Partial<CoTEntity> = {}): CoTEntity => ({
  uid,
  lat: 40,
  lon: -74,
  altitude: 10000,
  type: "a-f-A-C-F",
  course: 0,
  speed: 0,
  callsign: uid,
  lastSeen,
  trail: [],
  uidHash: 1,
  ...overrides,
});

const makeShip = (uid: string, lastSeen: number, overrides: Partial<CoTEntity> = {}): CoTEntity => ({
  uid,
  lat: 40,
  lon: -74,
  altitude: 0,
  type: "a-f-S-C-V",
  course: 0,
  speed: 0,
  callsign: uid,
  lastSeen,
  trail: [],
  uidHash: 2,
  ...overrides,
});

const makeFilters = (overrides: Partial<MapFilters> = {}): MapFilters => ({
  showAir: true,
  showSea: true,
  showSatellites: false,
  showHelicopter: true,
  showMilitary: true,
  showGovernment: true,
  showCommercial: true,
  showPrivate: true,
  showAurora: false,
  showJamming: false,
  showSatNOGS: false,
  showGdelt: false,
  ...overrides,
});

// ─── STALE_THRESHOLD constants ────────────────────────────────────────────────

describe("stale threshold constants", () => {
  it("STALE_THRESHOLD_AIR_MS should be 120 seconds", () => {
    expect(STALE_THRESHOLD_AIR_MS).toBe(120_000);
  });

  it("STALE_THRESHOLD_SEA_MS should be 300 seconds", () => {
    expect(STALE_THRESHOLD_SEA_MS).toBe(300_000);
  });
});

// ─── processEntityFrame — stale detection ────────────────────────────────────

describe("processEntityFrame — stale detection", () => {
  it("should mark aircraft as stale after 120 seconds", () => {
    const now = 1_000_000;
    const staleAircraft = makeAircraft("ac-stale", now - STALE_THRESHOLD_AIR_MS - 1);
    const entities = new Map([["ac-stale", staleAircraft]]);

    const result = processEntityFrame(entities, new Map(), new Map(), makeFilters(), now, 16);

    expect(result.staleUids).toContain("ac-stale");
    expect(result.interpolated).toHaveLength(0);
  });

  it("should NOT mark aircraft as stale within 120 seconds", () => {
    const now = 1_000_000;
    const freshAircraft = makeAircraft("ac-fresh", now - STALE_THRESHOLD_AIR_MS + 1000);
    const entities = new Map([["ac-fresh", freshAircraft]]);

    const result = processEntityFrame(entities, new Map(), new Map(), makeFilters(), now, 16);

    expect(result.staleUids).not.toContain("ac-fresh");
    expect(result.interpolated).toHaveLength(1);
  });

  it("should mark ships stale after 300 seconds (not 120)", () => {
    const now = 1_000_000;
    // Would be stale for aircraft (>120s) but not for ship (<300s)
    const ship = makeShip("ship-1", now - 180_000);
    const entities = new Map([["ship-1", ship]]);

    const result = processEntityFrame(entities, new Map(), new Map(), makeFilters(), now, 16);

    expect(result.staleUids).not.toContain("ship-1");
    expect(result.interpolated).toHaveLength(1);
  });

  it("should mark ships stale after 300 seconds", () => {
    const now = 1_000_000;
    const ship = makeShip("ship-old", now - STALE_THRESHOLD_SEA_MS - 1);
    const entities = new Map([["ship-old", ship]]);

    const result = processEntityFrame(entities, new Map(), new Map(), makeFilters(), now, 16);

    expect(result.staleUids).toContain("ship-old");
  });
});

// ─── processEntityFrame — filtering ──────────────────────────────────────────

describe("processEntityFrame — filtering", () => {
  it("should exclude aircraft when showAir is false", () => {
    const now = 1_000_000;
    const aircraft = makeAircraft("ac-1", now - 1000);
    const entities = new Map([["ac-1", aircraft]]);

    const result = processEntityFrame(entities, new Map(), new Map(), makeFilters({ showAir: false }), now, 16);

    expect(result.interpolated).toHaveLength(0);
    expect(result.airCount).toBe(0);
  });

  it("should exclude ships when showSea is false", () => {
    const now = 1_000_000;
    const ship = makeShip("ship-1", now - 1000);
    const entities = new Map([["ship-1", ship]]);

    const result = processEntityFrame(entities, new Map(), new Map(), makeFilters({ showSea: false }), now, 16);

    expect(result.interpolated).toHaveLength(0);
    expect(result.seaCount).toBe(0);
  });

  it("should count air and sea separately", () => {
    const now = 1_000_000;
    const entities = new Map([
      ["ac-1", makeAircraft("ac-1", now - 1000)],
      ["ac-2", makeAircraft("ac-2", now - 2000)],
      ["ship-1", makeShip("ship-1", now - 1000)],
    ]);

    const result = processEntityFrame(entities, new Map(), new Map(), makeFilters(), now, 16);

    expect(result.airCount).toBe(2);
    expect(result.seaCount).toBe(1);
    expect(result.interpolated).toHaveLength(3);
  });
});

// ─── processEntityFrame — visual state update ─────────────────────────────────

describe("processEntityFrame — visual state mutation", () => {
  it("should populate visualState for new entities", () => {
    const now = 1_000_000;
    const aircraft = makeAircraft("ac-1", now - 1000);
    const entities = new Map([["ac-1", aircraft]]);
    const visualState = new Map<string, VisualState>();

    processEntityFrame(entities, new Map(), visualState, makeFilters(), now, 16);

    expect(visualState.has("ac-1")).toBe(true);
    const vs = visualState.get("ac-1")!;
    expect(vs.lat).toBeCloseTo(40, 4);
    expect(vs.lon).toBeCloseTo(-74, 4);
  });

  it("should return empty result for empty entity map", () => {
    const result = processEntityFrame(new Map(), new Map(), new Map(), makeFilters(), Date.now(), 16);
    expect(result.interpolated).toHaveLength(0);
    expect(result.staleUids).toHaveLength(0);
    expect(result.airCount).toBe(0);
    expect(result.seaCount).toBe(0);
  });

  it("should not add stale entities to visualState", () => {
    const now = 1_000_000;
    const staleAc = makeAircraft("stale", now - STALE_THRESHOLD_AIR_MS - 5000);
    const entities = new Map([["stale", staleAc]]);
    const visualState = new Map<string, VisualState>();

    processEntityFrame(entities, new Map(), visualState, makeFilters(), now, 16);

    expect(visualState.has("stale")).toBe(false);
  });
});

// ─── processReplayFrame ───────────────────────────────────────────────────────

describe("processReplayFrame", () => {
  it("should include all passing entities without interpolation", () => {
    const entities = new Map([
      ["ac-1", makeAircraft("ac-1", Date.now())],
      ["ac-2", makeAircraft("ac-2", Date.now())],
      ["ship-1", makeShip("ship-1", Date.now())],
    ]);

    const result = processReplayFrame(entities, makeFilters());

    expect(result.interpolated).toHaveLength(3);
    expect(result.airCount).toBe(2);
    expect(result.seaCount).toBe(1);
  });

  it("should apply filters to replay entities", () => {
    const entities = new Map([
      ["ac-1", makeAircraft("ac-1", Date.now())],
      ["ship-1", makeShip("ship-1", Date.now())],
    ]);

    const result = processReplayFrame(entities, makeFilters({ showAir: false }));

    expect(result.interpolated).toHaveLength(1);
    expect(result.airCount).toBe(0);
    expect(result.seaCount).toBe(1);
  });

  it("should return empty result for empty replay entities", () => {
    const result = processReplayFrame(new Map(), makeFilters());
    expect(result.interpolated).toHaveLength(0);
    expect(result.airCount).toBe(0);
    expect(result.seaCount).toBe(0);
  });

  it("should not filter by staleness in replay mode", () => {
    // Replay entities are historical snapshots — lastSeen is intentionally old
    const oldTimestamp = Date.now() - 99_999_999;
    const entities = new Map([
      ["ac-old", makeAircraft("ac-old", oldTimestamp)],
    ]);

    const result = processReplayFrame(entities, makeFilters());

    expect(result.interpolated).toHaveLength(1);
  });
});
