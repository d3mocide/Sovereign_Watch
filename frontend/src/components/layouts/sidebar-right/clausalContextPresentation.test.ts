import { describe, expect, it } from "vitest";

import { getClausalSpaceWeatherPresentation } from "./clausalContextPresentation";

describe("getClausalSpaceWeatherPresentation", () => {
  it("describes admitted thresholded external-driver context", () => {
    const presentation = getClausalSpaceWeatherPresentation({
      context_scope: {
        space_weather: {
          scope: "impact_linked_external",
          linkage_reason: "global_propagation",
          notes: "Thresholded external-driver gate applied: kp>=5",
        },
      },
      space_weather_context: {
        kp_index: 5,
        kp_category: "G1",
        threshold_passed: true,
        threshold: "kp>=5",
      },
    });

    expect(presentation).not.toBeNull();
    expect(presentation?.scopeLabel).toBe("Impact Linked External");
    expect(presentation?.linkageReasonLabel).toBe("Global Propagation");
    expect(presentation?.thresholdLabel).toBe("kp>=5");
    expect(presentation?.statusLabel).toContain("Kp 5.0 (G1)");
    expect(presentation?.isAdmitted).toBe(true);
  });

  it("keeps external-driver labeling when the threshold is not met", () => {
    const presentation = getClausalSpaceWeatherPresentation({
      context_scope: {
        space_weather: {
          scope: "impact_linked_external",
          linkage_reason: "global_propagation",
          notes: "Thresholded external-driver gate applied: kp>=5",
        },
      },
      space_weather_context: null,
    });

    expect(presentation).not.toBeNull();
    expect(presentation?.scopeLabel).toBe("Impact Linked External");
    expect(presentation?.thresholdLabel).toBe("kp>=5");
    expect(presentation?.statusLabel).toBe(
      "Below threshold; external-driver context omitted",
    );
    expect(presentation?.isAdmitted).toBe(false);
  });
});