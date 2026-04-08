import { describe, expect, it } from "vitest";
import {
  DISTRESS_NAV_STATUSES,
  buildMaritimeAlertMessage,
  getMaritimeAlertKey,
} from "./MaritimeAlertEngine";
import type { VesselClassification } from "../types";

describe("DISTRESS_NAV_STATUSES", () => {
  it("should include NOT UNDER COMMAND (2)", () => {
    expect(DISTRESS_NAV_STATUSES[2]).toBe("NOT UNDER COMMAND");
  });

  it("should include AGROUND (6)", () => {
    expect(DISTRESS_NAV_STATUSES[6]).toBe("AGROUND");
  });

  it("should include AIS-SART DISTRESS (14)", () => {
    expect(DISTRESS_NAV_STATUSES[14]).toBe("AIS-SART DISTRESS");
  });
});

describe("getMaritimeAlertKey", () => {
  it("should return empty string when classification is undefined", () => {
    expect(getMaritimeAlertKey(undefined)).toBe("");
  });

  it("should return empty string when navStatus is undefined", () => {
    const cls: VesselClassification = { category: "cargo" };
    expect(getMaritimeAlertKey(cls)).toBe("");
  });

  it("should return empty string for normal underway nav status (0)", () => {
    const cls: VesselClassification = { navStatus: 0 };
    expect(getMaritimeAlertKey(cls)).toBe("");
  });

  it("should return navStatus key for NOT UNDER COMMAND (2)", () => {
    const cls: VesselClassification = { navStatus: 2 };
    expect(getMaritimeAlertKey(cls)).toBe("navStatus:2");
  });

  it("should return navStatus key for AGROUND (6)", () => {
    const cls: VesselClassification = { navStatus: 6 };
    expect(getMaritimeAlertKey(cls)).toBe("navStatus:6");
  });

  it("should return navStatus key for AIS-SART DISTRESS (14)", () => {
    const cls: VesselClassification = { navStatus: 14 };
    expect(getMaritimeAlertKey(cls)).toBe("navStatus:14");
  });

  it("should return empty string for non-distress nav status (1 = anchored)", () => {
    const cls: VesselClassification = { navStatus: 1 };
    expect(getMaritimeAlertKey(cls)).toBe("");
  });
});

describe("buildMaritimeAlertMessage", () => {
  it("should format NOT UNDER COMMAND alert", () => {
    expect(buildMaritimeAlertMessage("CARGO01", "navStatus:2")).toBe(
      "NOT UNDER COMMAND — CARGO01",
    );
  });

  it("should format AGROUND alert", () => {
    expect(buildMaritimeAlertMessage("TANKER01", "navStatus:6")).toBe(
      "AGROUND — TANKER01",
    );
  });

  it("should format AIS-SART DISTRESS alert", () => {
    expect(buildMaritimeAlertMessage("VESSEL01", "navStatus:14")).toBe(
      "AIS-SART DISTRESS — VESSEL01",
    );
  });

  it("should fall back to MARITIME ALERT for unknown nav status code", () => {
    expect(buildMaritimeAlertMessage("UNKNOWN01", "navStatus:99")).toBe(
      "MARITIME ALERT — UNKNOWN01",
    );
  });
});
