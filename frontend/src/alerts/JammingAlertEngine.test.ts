import { describe, expect, it } from "vitest";
import {
  JAMMING_ALERT_MIN_CONFIDENCE,
  buildJammingAlertMessage,
  getJammingAlertKey,
} from "./JammingAlertEngine";
import type { JammingZone } from "../types";

const makeZone = (overrides: Partial<JammingZone> = {}): JammingZone => ({
  h3_index: "8928308280fffff",
  centroid_lat: 40.0,
  centroid_lon: -74.0,
  confidence: 0.85,
  affected_count: 12,
  avg_nic: 5,
  avg_nacp: 7,
  kp_at_event: 2,
  active: true,
  assessment: "jamming",
  time: "2026-04-08T10:00:00Z",
  ...overrides,
});

describe("getJammingAlertKey", () => {
  it("should return a stable key for a jamming assessment above confidence threshold", () => {
    const zone = makeZone({ assessment: "jamming", confidence: JAMMING_ALERT_MIN_CONFIDENCE });
    expect(getJammingAlertKey(zone)).toBe("jamming:8928308280fffff");
  });

  it("should return a stable key for a mixed assessment above confidence threshold", () => {
    const zone = makeZone({ assessment: "mixed", confidence: 0.9 });
    expect(getJammingAlertKey(zone)).toBe("jamming:8928308280fffff");
  });

  it("should return empty string for space_weather assessment", () => {
    const zone = makeZone({ assessment: "space_weather", confidence: 0.99 });
    expect(getJammingAlertKey(zone)).toBe("");
  });

  it("should return empty string for equipment assessment", () => {
    const zone = makeZone({ assessment: "equipment", confidence: 0.99 });
    expect(getJammingAlertKey(zone)).toBe("");
  });

  it("should return empty string when confidence is below minimum threshold", () => {
    const zone = makeZone({ assessment: "jamming", confidence: JAMMING_ALERT_MIN_CONFIDENCE - 0.01 });
    expect(getJammingAlertKey(zone)).toBe("");
  });

  it("should return key when confidence is exactly at the threshold", () => {
    const zone = makeZone({ assessment: "jamming", confidence: JAMMING_ALERT_MIN_CONFIDENCE });
    expect(getJammingAlertKey(zone)).toBe("jamming:8928308280fffff");
  });

  it("should use the h3_index in the key", () => {
    const zone = makeZone({ h3_index: "89283082803ffff", assessment: "jamming" });
    expect(getJammingAlertKey(zone)).toBe("jamming:89283082803ffff");
  });
});

describe("buildJammingAlertMessage", () => {
  it("should format a jamming assessment alert with count and confidence", () => {
    const zone = makeZone({ assessment: "jamming", confidence: 0.85, affected_count: 7 });
    expect(buildJammingAlertMessage(zone)).toBe(
      "JAMMING: GPS degradation zone active — 7 aircraft affected (85% confidence)",
    );
  });

  it("should format a mixed assessment alert differently", () => {
    const zone = makeZone({ assessment: "mixed", confidence: 0.72, affected_count: 3 });
    expect(buildJammingAlertMessage(zone)).toBe(
      "RF ALERT: Mixed GPS integrity anomaly — 3 aircraft affected (72% confidence)",
    );
  });

  it("should round confidence percentage", () => {
    const zone = makeZone({ assessment: "jamming", confidence: 0.876, affected_count: 5 });
    expect(buildJammingAlertMessage(zone)).toBe(
      "JAMMING: GPS degradation zone active — 5 aircraft affected (88% confidence)",
    );
  });

  it("should handle 100% confidence", () => {
    const zone = makeZone({ assessment: "jamming", confidence: 1.0, affected_count: 20 });
    expect(buildJammingAlertMessage(zone)).toBe(
      "JAMMING: GPS degradation zone active — 20 aircraft affected (100% confidence)",
    );
  });
});
