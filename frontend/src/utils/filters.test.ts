import { describe, expect, it } from "vitest";
import { filterEntity, filterSatellite } from "./filters";
import type { CoTEntity, MapFilters } from "../types";

// ─── Factories ────────────────────────────────────────────────────────────────

const makeAircraft = (overrides: Partial<CoTEntity> = {}): CoTEntity => ({
  uid: "air-1",
  lat: 40,
  lon: -74,
  altitude: 10000,
  type: "a-f-A-C-F",
  course: 90,
  speed: 450,
  callsign: "TEST01",
  lastSeen: Date.now(),
  trail: [],
  uidHash: 1,
  ...overrides,
});

const makeShip = (overrides: Partial<CoTEntity> = {}): CoTEntity => ({
  uid: "ship-1",
  lat: 40,
  lon: -74,
  altitude: 0,
  type: "a-f-S-C-V",
  course: 180,
  speed: 10,
  callsign: "CARGO01",
  lastSeen: Date.now(),
  trail: [],
  uidHash: 2,
  ...overrides,
});

const makeSatellite = (overrides: Partial<CoTEntity> = {}): CoTEntity => ({
  uid: "sat-1",
  lat: 0,
  lon: 0,
  altitude: 400000,
  type: "a-f-G",
  course: 0,
  speed: 7800,
  callsign: "ISS",
  lastSeen: Date.now(),
  trail: [],
  uidHash: 3,
  detail: {},
  ...overrides,
});

const makeFilters = (overrides: Partial<MapFilters> = {}): MapFilters => ({
  showAir: true,
  showSea: true,
  showSatellites: true,
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

// ─── filterEntity — aircraft ───────────────────────────────────────────────────

describe("filterEntity — aircraft", () => {
  it("should return 'air' when showAir is true", () => {
    expect(filterEntity(makeAircraft(), makeFilters())).toBe("air");
  });

  it("should return null when showAir is false", () => {
    expect(filterEntity(makeAircraft(), makeFilters({ showAir: false }))).toBeNull();
  });

  it("should return null when filters are undefined", () => {
    expect(filterEntity(makeAircraft(), undefined)).toBeNull();
  });

  it("should allow military aircraft when showMilitary is true", () => {
    const e = makeAircraft({ classification: { affiliation: "military" } });
    expect(filterEntity(e, makeFilters({ showMilitary: true }))).toBe("air");
  });

  it("should filter out military aircraft when showMilitary is false", () => {
    const e = makeAircraft({ classification: { affiliation: "military" } });
    expect(filterEntity(e, makeFilters({ showMilitary: false }))).toBeNull();
  });

  it("should filter out government aircraft when showGovernment is false", () => {
    const e = makeAircraft({ classification: { affiliation: "government" } });
    expect(filterEntity(e, makeFilters({ showGovernment: false }))).toBeNull();
  });

  it("should filter out commercial aircraft when showCommercial is false", () => {
    const e = makeAircraft({ classification: { affiliation: "commercial" } });
    expect(filterEntity(e, makeFilters({ showCommercial: false }))).toBeNull();
  });

  it("should filter out general aviation when showPrivate is false", () => {
    const e = makeAircraft({ classification: { affiliation: "general_aviation" } });
    expect(filterEntity(e, makeFilters({ showPrivate: false }))).toBeNull();
  });

  it("should allow helicopters when showHelicopter is not false", () => {
    const e = makeAircraft({ classification: { platform: "helicopter" } });
    expect(filterEntity(e, makeFilters())).toBe("air");
  });

  it("should filter out helicopters when showHelicopter is false", () => {
    const e = makeAircraft({ classification: { platform: "helicopter" } });
    expect(filterEntity(e, makeFilters({ showHelicopter: false }))).toBeNull();
  });

  it("should filter out drones when showDrone is false", () => {
    const e = makeAircraft({ classification: { platform: "drone" } });
    expect(filterEntity(e, { ...makeFilters(), showDrone: false })).toBeNull();
  });

  it("should filter out UAVs when showDrone is false", () => {
    const e = makeAircraft({ classification: { platform: "uav" } });
    expect(filterEntity(e, { ...makeFilters(), showDrone: false })).toBeNull();
  });

  it("should allow aircraft with no classification when showAir is true", () => {
    const e = makeAircraft({ classification: undefined });
    expect(filterEntity(e, makeFilters())).toBe("air");
  });
});

// ─── filterEntity — ships ──────────────────────────────────────────────────────

describe("filterEntity — ships", () => {
  it("should return 'sea' for ship type when showSea is true", () => {
    expect(filterEntity(makeShip(), makeFilters())).toBe("sea");
  });

  it("should return null when showSea is false", () => {
    expect(filterEntity(makeShip(), makeFilters({ showSea: false }))).toBeNull();
  });

  it("should filter out cargo when showCargo is false", () => {
    const e = makeShip({ vesselClassification: { category: "cargo" } });
    expect(filterEntity(e, { ...makeFilters(), showCargo: false })).toBeNull();
  });

  it("should allow cargo when showCargo is not set (default allow)", () => {
    const e = makeShip({ vesselClassification: { category: "cargo" } });
    expect(filterEntity(e, makeFilters())).toBe("sea");
  });

  it("should filter out tanker when showTanker is false", () => {
    const e = makeShip({ vesselClassification: { category: "tanker" } });
    expect(filterEntity(e, { ...makeFilters(), showTanker: false })).toBeNull();
  });

  it("should filter out passenger when showPassenger is false", () => {
    const e = makeShip({ vesselClassification: { category: "passenger" } });
    expect(filterEntity(e, { ...makeFilters(), showPassenger: false })).toBeNull();
  });

  it("should filter out fishing when showFishing is false", () => {
    const e = makeShip({ vesselClassification: { category: "fishing" } });
    expect(filterEntity(e, { ...makeFilters(), showFishing: false })).toBeNull();
  });

  it("should filter out sea military when showSeaMilitary is false", () => {
    const e = makeShip({ vesselClassification: { category: "military" } });
    expect(filterEntity(e, { ...makeFilters(), showSeaMilitary: false })).toBeNull();
  });

  it("should filter out SAR vessels when showSar is false", () => {
    const e = makeShip({ vesselClassification: { category: "sar" } });
    expect(filterEntity(e, { ...makeFilters(), showSar: false })).toBeNull();
  });

  it("should filter out tug vessels when showTug is false", () => {
    const e = makeShip({ vesselClassification: { category: "tug" } });
    expect(filterEntity(e, { ...makeFilters(), showTug: false })).toBeNull();
  });

  it("should allow ship with no vessel classification when showSea is true", () => {
    const e = makeShip({ vesselClassification: undefined });
    expect(filterEntity(e, makeFilters())).toBe("sea");
  });
});

// ─── filterSatellite ──────────────────────────────────────────────────────────

describe("filterSatellite", () => {
  it("should return false when showSatellites is false", () => {
    expect(filterSatellite(makeSatellite(), makeFilters({ showSatellites: false }))).toBe(false);
  });

  it("should return true for satellite with no category when showSatOther is not false", () => {
    expect(filterSatellite(makeSatellite(), makeFilters())).toBe(true);
  });

  it("should return false for satellite with no category when showSatOther is false", () => {
    expect(filterSatellite(makeSatellite(), { ...makeFilters(), showSatOther: false })).toBe(false);
  });

  it("should filter GPS satellites via showSatGPS", () => {
    const sat = makeSatellite({ detail: { category: "GPS IIF" } });
    expect(filterSatellite(sat, { ...makeFilters(), showSatGPS: false })).toBe(false);
    expect(filterSatellite(sat, { ...makeFilters(), showSatGPS: true })).toBe(true);
  });

  it("should filter GNSS satellites via showSatGPS", () => {
    const sat = makeSatellite({ detail: { category: "GNSS" } });
    expect(filterSatellite(sat, { ...makeFilters(), showSatGPS: false })).toBe(false);
  });

  it("should filter weather satellites via showSatWeather", () => {
    const sat = makeSatellite({ detail: { category: "NOAA-15" } });
    expect(filterSatellite(sat, { ...makeFilters(), showSatWeather: false })).toBe(false);
    expect(filterSatellite(sat, { ...makeFilters(), showSatWeather: true })).toBe(true);
  });

  it("should filter comms satellites via showSatComms", () => {
    const sat = makeSatellite({ detail: { category: "Starlink" } });
    expect(filterSatellite(sat, { ...makeFilters(), showSatComms: false })).toBe(false);
    expect(filterSatellite(sat, { ...makeFilters(), showSatComms: true })).toBe(true);
  });

  it("should filter surveillance satellites via showSatSurveillance", () => {
    const sat = makeSatellite({ detail: { category: "Earth Observation" } });
    expect(filterSatellite(sat, { ...makeFilters(), showSatSurveillance: false })).toBe(false);
  });

  it("should filter by constellation when showConstellation_X is false", () => {
    const sat = makeSatellite({ detail: { constellation: "Starlink" } });
    expect(filterSatellite(sat, { ...makeFilters(), showConstellation_Starlink: false })).toBe(false);
  });

  it("should return false when filters are undefined", () => {
    expect(filterSatellite(makeSatellite(), undefined)).toBe(false);
  });
});
