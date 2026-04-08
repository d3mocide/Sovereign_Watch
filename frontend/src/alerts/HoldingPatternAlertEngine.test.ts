import { describe, expect, it } from "vitest";
import {
  HOLD_ALERT_MIN_CONFIDENCE,
  HOLD_ALERT_MIN_DURATION_SEC,
  HOLD_ALERT_MIN_TURNS,
  HOLD_CRITICAL_TURNS,
  buildHoldingAlertMessage,
  getHoldingAlertKey,
  isHoldingPatternCritical,
  shouldSuppressHoldingAlert,
} from "./HoldingPatternAlertEngine";
import type { HoldingPatternProps } from "./HoldingPatternAlertEngine";

const VALID_PROPS: HoldingPatternProps = {
  hex_id: "abc123",
  callsign: "N12345",
  altitude: 10000,
  confidence: HOLD_ALERT_MIN_CONFIDENCE,
  turns_completed: HOLD_ALERT_MIN_TURNS,
  pattern_duration_sec: HOLD_ALERT_MIN_DURATION_SEC,
};

describe("getHoldingAlertKey", () => {
  it("should return lowercase hex_id as key", () => {
    expect(getHoldingAlertKey({ hex_id: "ABC123" })).toBe("abc123");
  });

  it("should return empty string when hex_id is missing", () => {
    expect(getHoldingAlertKey({})).toBe("");
  });

  it("should return empty string when hex_id is empty", () => {
    expect(getHoldingAlertKey({ hex_id: "" })).toBe("");
  });
});

describe("shouldSuppressHoldingAlert", () => {
  it("should not suppress when all thresholds are met", () => {
    expect(shouldSuppressHoldingAlert(VALID_PROPS)).toBe(false);
  });

  it("should suppress when confidence is below threshold", () => {
    const props = { ...VALID_PROPS, confidence: HOLD_ALERT_MIN_CONFIDENCE - 0.01 };
    expect(shouldSuppressHoldingAlert(props)).toBe(true);
  });

  it("should suppress when turns_completed is below threshold", () => {
    const props = { ...VALID_PROPS, turns_completed: HOLD_ALERT_MIN_TURNS - 0.1 };
    expect(shouldSuppressHoldingAlert(props)).toBe(true);
  });

  it("should suppress when duration is below threshold", () => {
    const props = { ...VALID_PROPS, pattern_duration_sec: HOLD_ALERT_MIN_DURATION_SEC - 1 };
    expect(shouldSuppressHoldingAlert(props)).toBe(true);
  });

  it("should suppress when all fields are missing (defaults to 0)", () => {
    expect(shouldSuppressHoldingAlert({})).toBe(true);
  });

  it("should handle string values by coercing to number", () => {
    const props: HoldingPatternProps = {
      confidence: String(HOLD_ALERT_MIN_CONFIDENCE) as unknown as number,
      turns_completed: String(HOLD_ALERT_MIN_TURNS) as unknown as number,
      pattern_duration_sec: String(HOLD_ALERT_MIN_DURATION_SEC) as unknown as number,
    };
    expect(shouldSuppressHoldingAlert(props)).toBe(false);
  });

  it("should not suppress when values are exactly at the threshold boundary", () => {
    expect(shouldSuppressHoldingAlert(VALID_PROPS)).toBe(false);
  });
});

describe("isHoldingPatternCritical", () => {
  it("should return false when turns are below critical threshold", () => {
    const props = { ...VALID_PROPS, turns_completed: HOLD_CRITICAL_TURNS - 0.1 };
    expect(isHoldingPatternCritical(props)).toBe(false);
  });

  it("should return true when turns meet the critical threshold", () => {
    const props = { ...VALID_PROPS, turns_completed: HOLD_CRITICAL_TURNS };
    expect(isHoldingPatternCritical(props)).toBe(true);
  });

  it("should return true when turns exceed the critical threshold", () => {
    const props = { ...VALID_PROPS, turns_completed: HOLD_CRITICAL_TURNS + 2 };
    expect(isHoldingPatternCritical(props)).toBe(true);
  });

  it("should return false when turns_completed is missing (defaults to 0)", () => {
    expect(isHoldingPatternCritical({})).toBe(false);
  });
});

describe("buildHoldingAlertMessage", () => {
  it("should use HOLD prefix for non-critical pattern with callsign and altitude", () => {
    const msg = buildHoldingAlertMessage(VALID_PROPS, false);
    expect(msg).toBe("HOLD: Active holding pattern detected — N12345 (10000ft)");
  });

  it("should use ALERT prefix for critical pattern", () => {
    const msg = buildHoldingAlertMessage(VALID_PROPS, true);
    expect(msg).toBe("ALERT: Active holding pattern detected — N12345 (10000ft)");
  });

  it("should fall back to hex_id when callsign is missing", () => {
    const props: HoldingPatternProps = { hex_id: "deadbeef", altitude: 5000 };
    const msg = buildHoldingAlertMessage(props, false);
    expect(msg).toBe("HOLD: Active holding pattern detected — deadbeef (5000ft)");
  });

  it("should fall back to UNKNOWN when both callsign and hex_id are missing", () => {
    const msg = buildHoldingAlertMessage({}, false);
    expect(msg).toBe("HOLD: Active holding pattern detected — UNKNOWN");
  });

  it("should omit altitude when not provided", () => {
    const props: HoldingPatternProps = { callsign: "N99999" };
    const msg = buildHoldingAlertMessage(props, false);
    expect(msg).toBe("HOLD: Active holding pattern detected — N99999");
  });
});
