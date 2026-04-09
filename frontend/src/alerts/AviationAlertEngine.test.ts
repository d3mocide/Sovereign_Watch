import { describe, expect, it } from "vitest";
import {
  EMERGENCY_SQUAWKS,
  buildAlertMessage,
  getEmergencyKey,
} from "./AviationAlertEngine";
import type { EntityClassification } from "../types";

describe("EMERGENCY_SQUAWKS", () => {
  it("should contain the three standard emergency squawk codes", () => {
    expect(EMERGENCY_SQUAWKS.has("7500")).toBe(true);
    expect(EMERGENCY_SQUAWKS.has("7600")).toBe(true);
    expect(EMERGENCY_SQUAWKS.has("7700")).toBe(true);
  });

  it("should not contain non-emergency codes", () => {
    expect(EMERGENCY_SQUAWKS.has("1200")).toBe(false);
    expect(EMERGENCY_SQUAWKS.has("0000")).toBe(false);
    expect(EMERGENCY_SQUAWKS.has("7000")).toBe(false);
  });
});

describe("getEmergencyKey", () => {
  it("should return empty string when classification is undefined", () => {
    expect(getEmergencyKey(undefined)).toBe("");
  });

  it("should return empty string when classification has no squawk or emergency", () => {
    const cls: EntityClassification = { affiliation: "commercial" };
    expect(getEmergencyKey(cls)).toBe("");
  });

  it("should return squawk key for 7500 (hijack)", () => {
    const cls: EntityClassification = { squawk: "7500" };
    expect(getEmergencyKey(cls)).toBe("squawk:7500");
  });

  it("should return squawk key for 7600 (radio failure)", () => {
    const cls: EntityClassification = { squawk: "7600" };
    expect(getEmergencyKey(cls)).toBe("squawk:7600");
  });

  it("should return squawk key for 7700 (general emergency)", () => {
    const cls: EntityClassification = { squawk: "7700" };
    expect(getEmergencyKey(cls)).toBe("squawk:7700");
  });

  it("should return empty string for non-emergency squawk", () => {
    const cls: EntityClassification = { squawk: "1200" };
    expect(getEmergencyKey(cls)).toBe("");
  });

  it("should return emergency key when emergency field is set", () => {
    const cls: EntityClassification = { emergency: "general" };
    expect(getEmergencyKey(cls)).toBe("emergency:general");
  });

  it("should return empty string when emergency is 'none'", () => {
    const cls: EntityClassification = { emergency: "none" };
    expect(getEmergencyKey(cls)).toBe("");
  });

  it("should return empty string when emergency is empty string", () => {
    const cls: EntityClassification = { emergency: "" };
    expect(getEmergencyKey(cls)).toBe("");
  });

  it("should prefer squawk key over emergency key when both are set", () => {
    const cls: EntityClassification = { squawk: "7700", emergency: "general" };
    expect(getEmergencyKey(cls)).toBe("squawk:7700");
  });
});

describe("buildAlertMessage", () => {
  it("should format 7500 squawk as HIJACK alert", () => {
    expect(buildAlertMessage("AAL123", "squawk:7500")).toBe(
      "SQUAWK 7500 — AAL123 (HIJACK)",
    );
  });

  it("should format 7600 squawk as Radio Failure alert", () => {
    expect(buildAlertMessage("UAL456", "squawk:7600")).toBe(
      "SQUAWK 7600 — UAL456 (Radio Failure)",
    );
  });

  it("should format 7700 squawk as Emergency alert", () => {
    expect(buildAlertMessage("DAL789", "squawk:7700")).toBe(
      "SQUAWK 7700 — DAL789 (Emergency)",
    );
  });

  it("should format emergency type in uppercase", () => {
    expect(buildAlertMessage("N12345", "emergency:general")).toBe(
      "EMERGENCY — N12345: GENERAL",
    );
  });

  it("should format mayday emergency", () => {
    expect(buildAlertMessage("FAST01", "emergency:mayday")).toBe(
      "EMERGENCY — FAST01: MAYDAY",
    );
  });

  it("should fall back to generic ALERT for unknown key format", () => {
    expect(buildAlertMessage("TEST01", "unknown:xyz")).toBe("ALERT — TEST01");
  });
});
