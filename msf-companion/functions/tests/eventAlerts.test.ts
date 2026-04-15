import { describe, it, expect, vi } from "vitest";
import {
  detectEventAlerts,
  EventAlertDeps,
  detectMetaShifts,
} from "../src/functions/eventAlerts";
import { InvocationContext } from "@azure/functions";

function createMockContext(): InvocationContext {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  } as unknown as InvocationContext;
}

describe("eventAlerts", () => {
  it("creates event alert when new event blog post detected", async () => {
    const createNotification = vi.fn();
    const deps: EventAlertDeps = {
      fetchRecentBlogPosts: vi.fn().mockResolvedValue([
        {
          id: "post-1",
          title: "New Raid Season",
          type: "event_calendar",
          eventDates: "April 10-20",
          publishedAt: "2026-04-07T08:00:00Z",
        },
      ]),
      fetchRecentKnowledge: vi.fn().mockResolvedValue([]),
      fetchAllCommanderIds: vi.fn().mockResolvedValue(["cmd-1", "cmd-2"]),
      createNotification,
    };

    const result = await detectEventAlerts(deps, createMockContext());
    expect(result.eventAlerts).toBe(2);
    expect(createNotification).toHaveBeenCalledWith("cmd-1", expect.objectContaining({
      type: "event_alert",
      title: expect.stringContaining("New Raid Season"),
    }));
  });

  it("event alert includes event dates", async () => {
    const createNotification = vi.fn();
    const deps: EventAlertDeps = {
      fetchRecentBlogPosts: vi.fn().mockResolvedValue([
        {
          id: "post-1",
          title: "Blitz Event",
          type: "event_calendar",
          eventDates: "April 15",
          publishedAt: "2026-04-07T08:00:00Z",
        },
      ]),
      fetchRecentKnowledge: vi.fn().mockResolvedValue([]),
      fetchAllCommanderIds: vi.fn().mockResolvedValue(["cmd-1"]),
      createNotification,
    };

    await detectEventAlerts(deps, createMockContext());
    expect(createNotification).toHaveBeenCalledWith("cmd-1", expect.objectContaining({
      message: expect.stringContaining("April 15"),
    }));
  });

  it("meta shift triggers alert when 3+ creators recommend same team", () => {
    const knowledge = [
      { sourceCreatorName: "Creator1", content: "Eternals are the top team now", category: "team-comp" },
      { sourceCreatorName: "Creator2", content: "Build Eternals immediately", category: "team-comp" },
      { sourceCreatorName: "Creator3", content: "Eternals dominate arena", category: "team-comp" },
    ];

    const shifts = detectMetaShifts(knowledge);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].teamName).toBe("Eternals");
    expect(shifts[0].creatorCount).toBe(3);
  });

  it("no meta shift when fewer than 3 creators mention a team", () => {
    const knowledge = [
      { sourceCreatorName: "Creator1", content: "Eternals are good", category: "team-comp" },
      { sourceCreatorName: "Creator2", content: "Eternals are decent", category: "team-comp" },
    ];

    const shifts = detectMetaShifts(knowledge);
    expect(shifts).toHaveLength(0);
  });

  it("alerts use correct notification types", async () => {
    const createNotification = vi.fn();
    const deps: EventAlertDeps = {
      fetchRecentBlogPosts: vi.fn().mockResolvedValue([
        { id: "p1", title: "Patch 8.0", type: "patch_notes", publishedAt: "2026-04-07T08:00:00Z" },
      ]),
      fetchRecentKnowledge: vi.fn().mockResolvedValue([]),
      fetchAllCommanderIds: vi.fn().mockResolvedValue(["cmd-1"]),
      createNotification,
    };

    await detectEventAlerts(deps, createMockContext());
    expect(createNotification).toHaveBeenCalledWith("cmd-1", expect.objectContaining({
      type: "event_alert",
    }));
  });
});
