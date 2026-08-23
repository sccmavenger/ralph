import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emailAutomationMode,
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
});
