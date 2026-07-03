import { describe, it, expect } from "vitest";
import {
  digitsOnly,
  formatWalletNumber,
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
});
