import { describe, it, expect } from "vitest";
import {
  digitsOnly,
  formatWalletNumber,
  formatWalletCompact,
  formatConfirmedAgo,
  isValidWalletValue,
  parseWalletNumber,
} from "./wallet-format";

describe("wallet-format", () => {
  describe("digitsOnly", () => {
    it("keeps only digits", () => {
      expect(digitsOnly("1,840,000")).toBe("1840000");
      expect(digitsOnly("abc")).toBe("");
      expect(digitsOnly("12.3.4")).toBe("1234");
      expect(digitsOnly("-100")).toBe("100"); // sign dropped
    });
  });

  describe("formatWalletNumber", () => {
    it("adds thousands separators (TC-003.2)", () => {
      expect(formatWalletNumber("1840000")).toBe("1,840,000");
      expect(formatWalletNumber("6120")).toBe("6,120");
    });

    it("returns empty string for empty/invalid input", () => {
      expect(formatWalletNumber("")).toBe("");
      expect(formatWalletNumber("abc")).toBe("");
    });

    it("trims leading zeros", () => {
      expect(formatWalletNumber("007")).toBe("7");
      expect(formatWalletNumber("0")).toBe("0");
    });

    it("ignores non-numeric characters (TC-003.3)", () => {
      expect(formatWalletNumber("1a8b4c0000")).toBe("1,840,000");
      expect(formatWalletNumber("12.3.4")).toBe("1,234");
    });
  });

  describe("parseWalletNumber", () => {
    it("returns the raw integer for the API (TC-003.2)", () => {
      expect(parseWalletNumber("1,840,000")).toBe(1840000);
      expect(parseWalletNumber("6,120")).toBe(6120);
    });

    it("returns null for empty/non-numeric input (TC-003.3)", () => {
      expect(parseWalletNumber("")).toBeNull();
      expect(parseWalletNumber("abc")).toBeNull();
    });

    it("never yields a negative value (TC-003.4)", () => {
      expect(parseWalletNumber("-100")).toBe(100);
      expect(parseWalletNumber("-100")).toBeGreaterThanOrEqual(0);
    });

    it("rejects unsafe integers", () => {
      expect(parseWalletNumber("9".repeat(20))).toBeNull();
    });
  });

  describe("isValidWalletValue", () => {
    it("blocks Save until valid (TC-003.3 / TC-003.4)", () => {
      expect(isValidWalletValue("")).toBe(false);
      expect(isValidWalletValue("abc")).toBe(false);
      expect(isValidWalletValue("1,840,000")).toBe(true);
      expect(isValidWalletValue("0")).toBe(true);
    });
  });

  describe("formatWalletCompact (TC-004.1)", () => {
    it("abbreviates millions and keeps small values in full", () => {
      expect(formatWalletCompact(1_840_000)).toBe("1.84M");
      expect(formatWalletCompact(6_120)).toBe("6,120");
    });

    it("trims trailing zeros in the abbreviation", () => {
      expect(formatWalletCompact(2_000_000)).toBe("2M");
      expect(formatWalletCompact(1_500_000)).toBe("1.5M");
    });

    it("abbreviates billions and guards negatives", () => {
      expect(formatWalletCompact(3_200_000_000)).toBe("3.2B");
      expect(formatWalletCompact(-5)).toBe("0");
      expect(formatWalletCompact(0)).toBe("0");
    });
  });

  describe("formatConfirmedAgo (TC-004.2)", () => {
    const now = new Date("2026-07-03T12:00:00Z");
    const daysAgo = (n: number) =>
      new Date(now.getTime() - n * 86_400_000).toISOString();

    it("renders a relative age from confirmedAt", () => {
      expect(formatConfirmedAgo(daysAgo(2), now)).toBe("confirmed 2d ago");
      expect(formatConfirmedAgo(daysAgo(1), now)).toBe("confirmed 1d ago");
      expect(formatConfirmedAgo(daysAgo(0), now)).toBe("confirmed today");
    });

    it("returns empty string when there is no timestamp", () => {
      expect(formatConfirmedAgo(null, now)).toBe("");
      expect(formatConfirmedAgo(undefined, now)).toBe("");
      expect(formatConfirmedAgo("not-a-date", now)).toBe("");
    });
  });
});
