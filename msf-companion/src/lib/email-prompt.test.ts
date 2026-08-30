import { describe, expect, it } from "vitest";
import { shouldShowEmailPrompt } from "./email-prompt";

describe("shouldShowEmailPrompt", () => {
  it("asks an enabled commander without an email after OAuth login", () => {
    expect(
      shouldShowEmailPrompt({
        email: null,
        disabled: false,
        promptRequiredForLogin: true,
      })
    ).toBe(true);
  });

  it("does not ask again after the prompt is skipped for this session", () => {
    expect(
      shouldShowEmailPrompt({
        email: null,
        disabled: false,
        promptRequiredForLogin: false,
      })
    ).toBe(false);
  });

  it("waits for a real login when legacy sessions have no prompt state", () => {
    expect(
      shouldShowEmailPrompt({
        email: null,
        disabled: false,
        promptRequiredForLogin: undefined,
      })
    ).toBe(false);
  });

  it("does not ask commanders who have an email or are disabled", () => {
    expect(
      shouldShowEmailPrompt({
        email: "commander@example.com",
        disabled: false,
        promptRequiredForLogin: true,
      })
    ).toBe(false);

    expect(
      shouldShowEmailPrompt({
        email: null,
        disabled: true,
        promptRequiredForLogin: true,
      })
    ).toBe(false);
  });
});
