// @vitest-environment jsdom
/**
 * Unit tests for useMissionLocations hook.
 *
 * Covers: localStorage persistence, saveMission shape, deleteMission,
 * MAX_SAVED_MISSIONS (50) cap, and graceful recovery from corrupt storage.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMissionLocations } from "./useMissionLocations";

const STORAGE_KEY = "sovereign_mission_locations";

// Minimal mission payload (everything except id / created_at)
const baseMission = {
  name: "Test AOR",
  lat: 45.5152,
  lon: -122.6784,
  radius_nm: 150,
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("initial state", () => {
  it("starts with empty savedMissions when localStorage is empty", () => {
    const { result } = renderHook(() => useMissionLocations());
    expect(result.current.savedMissions).toEqual([]);
  });

  it("hydrates from localStorage on mount", () => {
    const stored = [
      { ...baseMission, id: "mission-1", created_at: new Date().toISOString() },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useMissionLocations());
    expect(result.current.savedMissions).toHaveLength(1);
    expect(result.current.savedMissions[0].id).toBe("mission-1");
  });

  it("returns empty array when localStorage contains corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{ not valid json %%");
    const { result } = renderHook(() => useMissionLocations());
    expect(result.current.savedMissions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// saveMission
// ---------------------------------------------------------------------------

describe("saveMission", () => {
  it("adds a new mission with a generated id and created_at", () => {
    const { result } = renderHook(() => useMissionLocations());

    act(() => {
      result.current.saveMission(baseMission);
    });

    expect(result.current.savedMissions).toHaveLength(1);
    const saved = result.current.savedMissions[0];
    expect(saved.id).toMatch(/^mission-\d+-[a-z0-9]+$/);
    expect(saved.created_at).toBeTruthy();
    expect(saved.lat).toBe(45.5152);
    expect(saved.name).toBe("Test AOR");
  });

  it("prepends new missions (newest first)", () => {
    const { result } = renderHook(() => useMissionLocations());

    act(() => {
      result.current.saveMission({ ...baseMission, name: "First" });
    });
    act(() => {
      result.current.saveMission({ ...baseMission, name: "Second" });
    });

    expect(result.current.savedMissions[0].name).toBe("Second");
    expect(result.current.savedMissions[1].name).toBe("First");
  });

  it("returns the newly created mission object", () => {
    const { result } = renderHook(() => useMissionLocations());

    let returned: ReturnType<typeof result.current.saveMission> | undefined;
    act(() => {
      returned = result.current.saveMission(baseMission);
    });

    expect(returned).toBeDefined();
    expect(returned!.id).toBeTruthy();
    expect(returned!.lat).toBe(baseMission.lat);
  });

  it("persists to localStorage after save", () => {
    const { result } = renderHook(() => useMissionLocations());

    act(() => {
      result.current.saveMission(baseMission);
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Test AOR");
  });

  it("enforces MAX_SAVED_MISSIONS limit of 50", () => {
    const { result } = renderHook(() => useMissionLocations());

    act(() => {
      // Save 55 missions — only the 50 newest should be kept
      for (let i = 0; i < 55; i++) {
        result.current.saveMission({ ...baseMission, name: `Mission ${i}` });
      }
    });

    expect(result.current.savedMissions).toHaveLength(50);
    // The newest (last added, prepended) should be Mission 54
    expect(result.current.savedMissions[0].name).toBe("Mission 54");
    // The oldest kept should be Mission 5 (55 - 50 = 5 dropped from the end)
    expect(result.current.savedMissions[49].name).toBe("Mission 5");
  });
});

// ---------------------------------------------------------------------------
// deleteMission
// ---------------------------------------------------------------------------

describe("deleteMission", () => {
  it("removes the mission with the matching id", () => {
    const { result } = renderHook(() => useMissionLocations());

    act(() => {
      result.current.saveMission({ ...baseMission, name: "A" });
      result.current.saveMission({ ...baseMission, name: "B" });
    });

    const idToDelete = result.current.savedMissions[0].id; // newest = "B"
    act(() => {
      result.current.deleteMission(idToDelete);
    });

    expect(result.current.savedMissions).toHaveLength(1);
    expect(result.current.savedMissions[0].name).toBe("A");
  });

  it("is a no-op for an unknown id", () => {
    const { result } = renderHook(() => useMissionLocations());

    act(() => {
      result.current.saveMission(baseMission);
    });
    act(() => {
      result.current.deleteMission("non-existent-id");
    });

    expect(result.current.savedMissions).toHaveLength(1);
  });

  it("persists the deletion to localStorage", () => {
    const { result } = renderHook(() => useMissionLocations());

    act(() => {
      result.current.saveMission(baseMission);
    });

    const id = result.current.savedMissions[0].id;
    act(() => {
      result.current.deleteMission(id);
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toHaveLength(0);
  });
});
