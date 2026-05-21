import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkAutoSave, markAsSaved } from "./tower-auto-save";

// Mock localStorage
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
};

Object.defineProperty(globalThis, "window", { value: {}, writable: true });
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

const mockTower = {
  id: "tower_1",
  name: "Alpha Tower",
  endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  currentWeek: 1,
};

describe("checkAutoSave", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("returns null on first visit (no prior tower)", () => {
    const result = checkAutoSave(mockTower, 12);
    expect(result).toBeNull();
  });

  it("returns null when same tower is still active", () => {
    localStorage.setItem("tower-last-active-event", JSON.stringify(mockTower));
    const result = checkAutoSave(mockTower, 12);
    expect(result).toBeNull();
  });

  it("triggers auto-save when tower event ends with progress", () => {
    // Set previous tower as active
    localStorage.setItem("tower-last-active-event", JSON.stringify(mockTower));
    // Set some cleared rooms
    localStorage.setItem("tower-cleared-tower_1-w1", JSON.stringify(["room1", "room2", "room3"]));

    // Now a different tower is active (meaning old one ended)
    const newTower = { ...mockTower, id: "tower_2", name: "Beta Tower" };
    const result = checkAutoSave(newTower, 12);

    expect(result).not.toBeNull();
    expect(result!.towerEventId).toBe("tower_1");
    expect(result!.towerName).toBe("Alpha Tower");
    expect(result!.roomsCleared).toBe(3);
    expect(result!.totalRooms).toBe(12);
  });

  it("skips auto-save when no progress (0 rooms cleared)", () => {
    localStorage.setItem("tower-last-active-event", JSON.stringify(mockTower));
    // No cleared rooms in localStorage

    const newTower = { ...mockTower, id: "tower_2", name: "Beta Tower" };
    const result = checkAutoSave(newTower, 12);
    expect(result).toBeNull();
  });

  it("skips auto-save when already saved", () => {
    localStorage.setItem("tower-last-active-event", JSON.stringify(mockTower));
    localStorage.setItem("tower-cleared-tower_1-w1", JSON.stringify(["room1"]));
    markAsSaved("tower_1");

    const newTower = { ...mockTower, id: "tower_2", name: "Beta Tower" };
    const result = checkAutoSave(newTower, 12);
    expect(result).toBeNull();
  });
});

describe("markAsSaved", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("persists saved event ID", () => {
    markAsSaved("tower_1");
    const stored = JSON.parse(localStorage.getItem("tower-saved-results")!);
    expect(stored).toContain("tower_1");
  });
});
