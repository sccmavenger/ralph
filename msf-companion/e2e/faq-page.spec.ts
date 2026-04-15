import { test, expect } from "@playwright/test";

// Suppress the InstallAppModal that blocks pointer events
async function suppressInstallModal(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "standalone", { value: true });
    const origMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query === "(display-mode: standalone)") {
        return { matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => true } as MediaQueryList;
      }
      return origMatchMedia(query);
    };
  });
}

const SECURITY_QUESTIONS = [
  "Is my account safe? Will I get banned?",
  "What data does this app access?",
  "Is my data secure?",
  "Do you store my data?",
  "What are progress snapshots?",
  "Why do you need my email?",
  "Why is this app mobile-only?",
];

const BILLING_QUESTIONS = [
  "How much does Premium cost?",
  "What do I get with Premium?",
  "How do I cancel my subscription?",
  "Will I lose my data if I cancel?",
  "Can I get a refund?",
  "How do I reactivate my subscription?",
  "Why was I charged after cancelling?",
];

test.describe("FAQ Page", () => {
  test.beforeEach(async ({ page }) => {
    await suppressInstallModal(page);
    await page.goto("/faq");
  });

  test("TC-001: section headings visible", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Security & Data" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Subscription & Billing" })).toBeVisible();
  });

  test("TC-002: all 7 original FAQ entries under Security & Data", async ({ page }) => {
    for (const question of SECURITY_QUESTIONS) {
      await expect(page.getByRole("button", { name: question })).toBeVisible();
    }
  });

  test("TC-003: all 7 billing FAQ entries under Subscription & Billing", async ({ page }) => {
    for (const question of BILLING_QUESTIONS) {
      await expect(page.getByRole("button", { name: question })).toBeVisible();
    }
  });

  test("TC-004: expanding 'How much does Premium cost?' shows $1.99/month", async ({ page }) => {
    await page.getByRole("button", { name: "How much does Premium cost?" }).click();
    await expect(page.getByText("$1.99/month")).toBeVisible();
  });

  test("TC-005: expanding 'How do I cancel my subscription?' mentions Profile page", async ({ page }) => {
    await page.getByRole("button", { name: "How do I cancel my subscription?" }).click();
    await expect(page.getByText("Profile page")).toBeVisible();
  });

  test("TC-006: 'Need more help?' section visible", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Need more help?" })).toBeVisible();
  });

  test("TC-007: email link has correct href", async ({ page }) => {
    const emailLink = page.getByRole("link", { name: "Email" });
    await expect(emailLink).toHaveAttribute("href", "mailto:info@themsftoolkit.com");
  });

  test("TC-008: Discord link has correct href and target", async ({ page }) => {
    const discordLink = page.getByRole("link", { name: "Discord" });
    await expect(discordLink).toHaveAttribute("href", "https://discord.gg/yyTq7KfX");
    await expect(discordLink).toHaveAttribute("target", "_blank");
  });

  test("TC-009: Instagram link has correct href and target", async ({ page }) => {
    const instagramLink = page.getByRole("link", { name: "Instagram" });
    await expect(instagramLink).toHaveAttribute("href", "https://www.instagram.com/msf_toolkit/");
    await expect(instagramLink).toHaveAttribute("target", "_blank");
  });

  test("TC-010: no horizontal overflow at 375px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/faq");
    const body = page.locator("body");
    const bodyWidth = await body.evaluate((el) => el.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(375);
  });
});
