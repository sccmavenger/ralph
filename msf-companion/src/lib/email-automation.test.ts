import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancellationFeedbackEmailMode,
  emailAutomationMode,
  newCharacterEmailAutomationMode,
  weeklyEmailAutomationMode,
} from "@/lib/email-automation";

describe("email automation modes", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("inherits the global mode when no weekly override is configured", () => {
    vi.stubEnv("EMAIL_AUTOMATION_MODE", "test");
    delete process.env.WEEKLY_EMAIL_AUTOMATION_MODE;

    expect(emailAutomationMode()).toBe("test");
    expect(weeklyEmailAutomationMode()).toBe("test");
  });

  it("allows weekly delivery to go live without enabling other automation", () => {
    vi.stubEnv("EMAIL_AUTOMATION_MODE", "test");
    vi.stubEnv("WEEKLY_EMAIL_AUTOMATION_MODE", "live");

    expect(emailAutomationMode()).toBe("test");
    expect(weeklyEmailAutomationMode()).toBe("live");
  });

  it("fails closed when the weekly override is invalid", () => {
    vi.stubEnv("EMAIL_AUTOMATION_MODE", "live");
    vi.stubEnv("WEEKLY_EMAIL_AUTOMATION_MODE", "unexpected");

    expect(weeklyEmailAutomationMode()).toBe("disabled");
  });

  it("allows new-character alerts to go live without enabling lifecycle automation", () => {
    vi.stubEnv("EMAIL_AUTOMATION_MODE", "test");
    vi.stubEnv("NEW_CHARACTER_EMAIL_AUTOMATION_MODE", "live");

    expect(emailAutomationMode()).toBe("test");
    expect(newCharacterEmailAutomationMode()).toBe("live");
  });

  it("inherits the global mode when no new-character override is configured", () => {
    vi.stubEnv("EMAIL_AUTOMATION_MODE", "test");
    delete process.env.NEW_CHARACTER_EMAIL_AUTOMATION_MODE;

    expect(newCharacterEmailAutomationMode()).toBe("test");
  });

  it("fails closed when the new-character override is invalid", () => {
    vi.stubEnv("EMAIL_AUTOMATION_MODE", "live");
    vi.stubEnv("NEW_CHARACTER_EMAIL_AUTOMATION_MODE", "unexpected");

    expect(newCharacterEmailAutomationMode()).toBe("disabled");
  });

  it("keeps cancellation feedback disabled unless its own mode is configured", () => {
    vi.stubEnv("EMAIL_AUTOMATION_MODE", "live");
    delete process.env.CANCELLATION_FEEDBACK_EMAIL_MODE;
    expect(cancellationFeedbackEmailMode()).toBe("disabled");

    vi.stubEnv("CANCELLATION_FEEDBACK_EMAIL_MODE", "test");
    expect(cancellationFeedbackEmailMode()).toBe("test");
  });
});
