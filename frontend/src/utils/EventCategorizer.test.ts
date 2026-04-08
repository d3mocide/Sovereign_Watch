import { describe, expect, it } from "vitest";
import { getEventStyle } from "./EventCategorizer";
import type { IntelEvent } from "../types";

const makeEvent = (overrides: Partial<IntelEvent> = {}): IntelEvent => ({
  id: "evt-1",
  time: new Date(),
  type: "new",
  message: "Test event",
  ...overrides,
});

describe("getEventStyle — alert events", () => {
  it("should return alert-red accent for alert type regardless of domain", () => {
    const style = getEventStyle(makeEvent({ type: "alert", entityType: "air" }));
    expect(style.accentColor).toBe("bg-alert-red");
    expect(style.textColor).toBe("text-alert-red");
    expect(style.borderLight).toBe("border-alert-red/30");
  });

  it("should return alert-red for alert type on sea domain", () => {
    const style = getEventStyle(makeEvent({ type: "alert", entityType: "sea" }));
    expect(style.accentColor).toBe("bg-alert-red");
  });
});

describe("getEventStyle — lost events", () => {
  it("should return alert-amber for lost type", () => {
    const style = getEventStyle(makeEvent({ type: "lost", entityType: "air" }));
    expect(style.accentColor).toBe("bg-alert-amber");
    expect(style.textColor).toBe("text-alert-amber");
    expect(style.borderLight).toBe("border-alert-amber/30");
  });
});

describe("getEventStyle — military affiliation", () => {
  it("should return amber-500 for military affiliation", () => {
    const style = getEventStyle(
      makeEvent({
        type: "new",
        entityType: "air",
        classification: { affiliation: "military" },
      }),
    );
    expect(style.accentColor).toBe("bg-amber-500");
    expect(style.textColor).toBe("text-amber-500");
    expect(style.borderLight).toBe("border-amber-500/30");
  });
});

describe("getEventStyle — government affiliation", () => {
  it("should return blue-400 for government affiliation", () => {
    const style = getEventStyle(
      makeEvent({
        type: "new",
        entityType: "air",
        classification: { affiliation: "government" },
      }),
    );
    expect(style.accentColor).toBe("bg-blue-400");
    expect(style.textColor).toBe("text-blue-400");
    expect(style.borderLight).toBe("border-blue-400/30");
  });
});

describe("getEventStyle — orbital domain", () => {
  it("should return purple-400 for orbital entity type", () => {
    const style = getEventStyle(makeEvent({ type: "new", entityType: "orbital" }));
    expect(style.accentColor).toBe("bg-purple-400");
    expect(style.textColor).toBe("text-purple-400");
    expect(style.borderLight).toBe("border-purple-400/30");
  });
});

describe("getEventStyle — infra domain", () => {
  it("should return cyan-400 for non-RF infra", () => {
    const style = getEventStyle(
      makeEvent({ type: "new", entityType: "infra", message: "Outage detected" }),
    );
    expect(style.accentColor).toBe("bg-cyan-400");
    expect(style.textColor).toBe("text-cyan-400");
    expect(style.borderLight).toBe("border-cyan-400/30");
  });

  it("should return emerald-400 for RF infra events", () => {
    const style = getEventStyle(
      makeEvent({ type: "new", entityType: "infra", message: "RF repeater online" }),
    );
    expect(style.accentColor).toBe("bg-emerald-400");
    expect(style.textColor).toBe("text-emerald-400");
    expect(style.borderLight).toBe("border-emerald-400/30");
  });

  it("should return emerald-400 for Repeater keyword in message", () => {
    const style = getEventStyle(
      makeEvent({ type: "new", entityType: "infra", message: "Repeater W6EL came online" }),
    );
    expect(style.accentColor).toBe("bg-emerald-400");
  });
});

describe("getEventStyle — air domain", () => {
  it("should return air-accent for air entity type with no special affiliation", () => {
    const style = getEventStyle(makeEvent({ type: "new", entityType: "air" }));
    expect(style.accentColor).toBe("bg-air-accent");
    expect(style.textColor).toBe("text-air-accent");
    expect(style.borderLight).toBe("border-air-accent/30");
  });
});

describe("getEventStyle — sea domain", () => {
  it("should return sea-accent for sea entity type (default fallback)", () => {
    const style = getEventStyle(makeEvent({ type: "new", entityType: "sea" }));
    expect(style.accentColor).toBe("bg-sea-accent");
    expect(style.textColor).toBe("text-sea-accent");
    expect(style.borderLight).toBe("border-sea-accent/30");
  });

  it("should return sea-accent when no entityType is set", () => {
    const style = getEventStyle(makeEvent({ type: "new" }));
    expect(style.accentColor).toBe("bg-sea-accent");
  });
});

describe("getEventStyle — priority ordering", () => {
  it("alert type should take priority over military affiliation", () => {
    const style = getEventStyle(
      makeEvent({
        type: "alert",
        entityType: "air",
        classification: { affiliation: "military" },
      }),
    );
    expect(style.accentColor).toBe("bg-alert-red");
  });

  it("lost type should take priority over military affiliation", () => {
    const style = getEventStyle(
      makeEvent({
        type: "lost",
        entityType: "air",
        classification: { affiliation: "military" },
      }),
    );
    expect(style.accentColor).toBe("bg-alert-amber");
  });

  it("military affiliation should take priority over orbital domain", () => {
    const style = getEventStyle(
      makeEvent({
        type: "new",
        entityType: "orbital",
        classification: { affiliation: "military" },
      }),
    );
    expect(style.accentColor).toBe("bg-amber-500");
  });
});
