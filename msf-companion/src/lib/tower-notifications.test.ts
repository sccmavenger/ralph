import { describe, it, expect } from "vitest";
import {
  shouldNotifyTowerStart,
  shouldNotifyWeek2Unlock,
  getTowerStartNotification,
  getWeek2UnlockNotification,
} from "./tower-notifications";

const mockEvent = {
  id: "tower_1",
  name: "Alpha Tower",
  startDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  currentWeek: 1,
};

describe("shouldNotifyTowerStart", () => {
  it("returns true for new event within 24h", () => {
    expect(shouldNotifyTowerStart(mockEvent, null, { towerEnabled: true })).toBe(true);
  });

  it("returns false if already notified for this event", () => {
    expect(shouldNotifyTowerStart(mockEvent, "tower_1", { towerEnabled: true })).toBe(false);
  });

  it("returns false if tower notifications disabled", () => {
    expect(shouldNotifyTowerStart(mockEvent, null, { towerEnabled: false })).toBe(false);
  });

  it("returns false if event started more than 24h ago", () => {
    const oldEvent = { ...mockEvent, startDate: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() };
    expect(shouldNotifyTowerStart(oldEvent, null, { towerEnabled: true })).toBe(false);
  });
});

describe("shouldNotifyWeek2Unlock", () => {
  it("returns true when week 2 and not previously notified", () => {
    const week2Event = { ...mockEvent, currentWeek: 2 };
    expect(shouldNotifyWeek2Unlock(week2Event, false, { towerEnabled: true })).toBe(true);
  });

  it("returns false when still week 1", () => {
    expect(shouldNotifyWeek2Unlock(mockEvent, false, { towerEnabled: true })).toBe(false);
  });

  it("returns false when already notified", () => {
    const week2Event = { ...mockEvent, currentWeek: 2 };
    expect(shouldNotifyWeek2Unlock(week2Event, true, { towerEnabled: true })).toBe(false);
  });

  it("returns false when tower notifications disabled", () => {
    const week2Event = { ...mockEvent, currentWeek: 2 };
    expect(shouldNotifyWeek2Unlock(week2Event, false, { towerEnabled: false })).toBe(false);
  });
});

describe("notification payloads", () => {
  it("getTowerStartNotification includes event name and link", () => {
    const notif = getTowerStartNotification(mockEvent);
    expect(notif.title).toContain("Alpha Tower");
    expect(notif.title).toContain("live");
    expect(notif.linkUrl).toBe("/analyze/tower-planner");
    expect(notif.type).toBe("tower_event_start");
  });

  it("getWeek2UnlockNotification includes event name and link", () => {
    const notif = getWeek2UnlockNotification(mockEvent);
    expect(notif.title).toContain("Week 2");
    expect(notif.title).toContain("refreshed");
    expect(notif.linkUrl).toBe("/analyze/tower-planner");
    expect(notif.type).toBe("tower_week2_unlock");
  });
});
