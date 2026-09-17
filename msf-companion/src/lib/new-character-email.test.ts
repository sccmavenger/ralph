import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: "live" as "disabled" | "test" | "live",
  testRecipient: "test@example.com" as string | null,
  findCommanders: vi.fn(),
  findDeliveries: vi.fn(),
  sendTrackedEmail: vi.fn(),
  prepareAssets: vi.fn(),
}));

vi.mock("@/lib/email-automation", () => ({
  newCharacterEmailAutomationMode: () => mocks.mode,
  emailTestRecipient: () => mocks.testRecipient,
}));

vi.mock("@/lib/email", () => ({
  hashEmailAddress: (email: string) => `hash:${email.trim().toLowerCase()}`,
  sendTrackedEmail: (...args: unknown[]) => mocks.sendTrackedEmail(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    commander: { findMany: (...args: unknown[]) => mocks.findCommanders(...args) },
    emailDelivery: { findMany: (...args: unknown[]) => mocks.findDeliveries(...args) },
  },
}));

vi.mock("@/lib/new-character-email-assets", () => ({
  prepareCharacterEmailAssets: (...args: unknown[]) => mocks.prepareAssets(...args),
}));

import { buildNewCharacterEmailHtml, sendNewCharacterEmails } from "./new-character-email";

const character = {
  id: "char-1",
  name: "Test <Hero>",
  traits: ["Bio"],
  teams: ["Test Team"],
  abilities: [{ name: "Basic & Better", description: "Hit > once" }],
};

describe("new-character email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mode = "live";
    mocks.testRecipient = "test@example.com";
    mocks.findCommanders.mockResolvedValue([]);
    mocks.findDeliveries.mockResolvedValue([]);
    mocks.sendTrackedEmail.mockResolvedValue({ status: "sent", providerMessageId: "email-1" });
    mocks.prepareAssets.mockImplementation(async (character) => ({ character, attachments: [] }));
  });

  afterEach(() => vi.useRealTimers());

  it("selects every eligible commander without filtering by subscription tier", async () => {
    vi.useFakeTimers();
    mocks.findCommanders.mockResolvedValue([
      { id: "free-commander", email: "free@example.com", subscriptionTier: "FREE" },
      { id: "premium-commander", email: "premium@example.com", subscriptionTier: "PREMIUM" },
    ]);

    const pending = sendNewCharacterEmails([character]);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toBe(2);
    expect(mocks.findCommanders).toHaveBeenCalledWith({
      where: {
        disabled: false,
        email: { not: null },
        emailNewCharacters: true,
        emailConsentSource: { not: null },
      },
      select: { id: true, email: true },
    });
    expect(mocks.sendTrackedEmail).toHaveBeenCalledTimes(2);
    expect(mocks.prepareAssets).toHaveBeenCalledOnce();
    expect(mocks.sendTrackedEmail.mock.calls.map(([options]) => options.commanderId)).toEqual([
      "free-commander",
      "premium-commander",
    ]);
  });

  it("deduplicates normalized mailboxes and excludes hard delivery suppressions", async () => {
    mocks.mode = "test";
    mocks.findCommanders.mockResolvedValue([
      { id: "clean", email: "Clean@Example.com" },
      { id: "duplicate", email: " clean@example.com " },
      { id: "bounced", email: "bounced@example.com" },
      { id: "provider-suppressed", email: "suppressed@example.com" },
    ]);
    mocks.findDeliveries.mockResolvedValue([
      { recipientHash: "hash:bounced@example.com" },
      { recipientHash: "hash:suppressed@example.com" },
    ]);

    await expect(sendNewCharacterEmails([character])).resolves.toBe(1);
    expect(mocks.findDeliveries).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { status: { in: ["bounced", "complained"] } },
          { status: "suppressed", attemptCount: { gt: 0 } },
        ],
      }),
    }));
    expect(mocks.sendTrackedEmail).toHaveBeenCalledOnce();
    expect(mocks.sendTrackedEmail).toHaveBeenCalledWith(expect.objectContaining({
      commanderId: "clean",
      to: "Clean@Example.com",
      preference: "newCharacters",
      messageType: "new_character",
    }));
  });

  it("uses the configured test mailbox while retaining preference and consent gates", async () => {
    mocks.mode = "test";
    mocks.testRecipient = "qa@example.com";

    await sendNewCharacterEmails([character]);

    expect(mocks.findCommanders).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        disabled: false,
        email: { equals: "qa@example.com", mode: "insensitive" },
        emailNewCharacters: true,
        emailConsentSource: { not: null },
      },
    }));
  });

  it("does no database or provider work when automation is disabled", async () => {
    mocks.mode = "disabled";

    await expect(sendNewCharacterEmails([character])).resolves.toBe(0);
    expect(mocks.findCommanders).not.toHaveBeenCalled();
    expect(mocks.sendTrackedEmail).not.toHaveBeenCalled();
    expect(mocks.prepareAssets).not.toHaveBeenCalled();
  });

  it("does no image work without an eligible audience", async () => {
    await expect(sendNewCharacterEmails([character])).resolves.toBe(0);
    expect(mocks.prepareAssets).not.toHaveBeenCalled();
  });

  it("uses the production spotlight and embedded assets without changing delivery identity", async () => {
    mocks.findCommanders.mockResolvedValue([{ id: "commander-1", email: "owner@example.com" }]);
    const attachments = [{ filename: "hero.png", contentId: "hero", contentType: "image/png", content: Buffer.from("image") }];
    mocks.prepareAssets.mockResolvedValue({ character: { ...character, portrait: "cid:hero" }, attachments });
    await expect(sendNewCharacterEmails([character])).resolves.toBe(1);
    const [options] = mocks.sendTrackedEmail.mock.calls[0];
    expect(options).toMatchObject({
      subject: "New Character Detected: Test <Hero>",
      idempotencyKey: "new-character:char-1:commander-1",
      preference: "newCharacters", attachments,
      metadata: { characterId: "char-1", automationMode: "live", templateVersion: "spotlight-v1" },
    });
    expect(options.html).toContain('src="cid:hero"');
    expect(options.html).toContain("CHARACTER SPOTLIGHT");
    expect(options.html).not.toMatch(/SAMPLE|REQUESTED RESEND/);
    expect(options.text).toContain("Basic & Better");
  });

  it("escapes official character data before rendering HTML", () => {
    const html = buildNewCharacterEmailHtml(character);

    expect(html).toContain("Test &lt;Hero&gt;");
    expect(html).toContain("Basic &amp; Better");
    expect(html).toContain("Hit &gt; once");
    expect(html).not.toContain("Test <Hero>");
  });
});
