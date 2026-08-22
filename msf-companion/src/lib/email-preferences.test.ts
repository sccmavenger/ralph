import { describe, expect, it } from "vitest";
import { commanderEmailPreferences, preferenceEnabled, preferenceUpdateData } from "./email-preferences";

const commander = {
  emailWeeklyDigest: false,
  emailNewCharacters: true,
  emailAnnouncements: false,
  emailReengagement: true,
};

describe("email preferences", () => {
  it("maps database fields to public preference keys", () => {
    expect(commanderEmailPreferences(commander)).toEqual({
      weeklyDigest: false,
      newCharacters: true,
      announcements: false,
      reengagement: true,
    });
    expect(preferenceEnabled(commander, "newCharacters")).toBe(true);
  });

  it("keeps the legacy digest flag synchronized", () => {
    expect(preferenceUpdateData({ weeklyDigest: false })).toEqual({
      emailWeeklyDigest: false,
      emailDigestOptOut: true,
    });
    expect(preferenceUpdateData({ announcements: true })).toEqual({
      emailAnnouncements: true,
    });
  });
});
