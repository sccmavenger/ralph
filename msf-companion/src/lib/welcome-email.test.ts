import { describe, it, expect } from "vitest";
import { buildWelcomeEmailHtml } from "./welcome-email";

describe("buildWelcomeEmailHtml", () => {
  it("includes the commander display name", () => {
    const html = buildWelcomeEmailHtml("TestCommander");
    expect(html).toContain("TestCommander");
  });

  it("falls back to 'Commander' when name is empty", () => {
    const html = buildWelcomeEmailHtml("");
    expect(html).toContain("Welcome to Premium, Commander!");
  });

  it("includes Discord invite link", () => {
    const html = buildWelcomeEmailHtml("Test");
    expect(html).toContain("discord.gg/yyTq7KfX");
    expect(html).toContain("Join the Discord");
  });

  it("includes FAQ link", () => {
    const html = buildWelcomeEmailHtml("Test");
    expect(html).toContain("/faq");
    expect(html).toContain("Frequently Asked Questions");
  });

  it("includes contact email", () => {
    const html = buildWelcomeEmailHtml("Test");
    expect(html).toContain("info@themsftoolkit.com");
  });

  it("includes thank you section", () => {
    const html = buildWelcomeEmailHtml("Test");
    expect(html).toContain("Thank You");
    expect(html).toContain("thank you for supporting MSF Companion");
  });

  it("includes premium feature highlights", () => {
    const html = buildWelcomeEmailHtml("Test");
    expect(html).toContain("AI Advisor");
    expect(html).toContain("Team Builder");
    expect(html).toContain("Dark Dimension Planner");
  });

  it("includes dashboard CTA", () => {
    const html = buildWelcomeEmailHtml("Test");
    expect(html).toContain("/dashboard");
    expect(html).toContain("Go to Your Dashboard");
  });

  it("produces valid HTML structure", () => {
    const html = buildWelcomeEmailHtml("Test");
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("</html>");
  });

  it("includes feedback invitation", () => {
    const html = buildWelcomeEmailHtml("Test");
    expect(html).toContain("questions, concerns, ideas");
  });
});
