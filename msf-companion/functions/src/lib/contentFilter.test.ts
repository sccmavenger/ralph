import { describe, it, expect } from "vitest";
import {
  containsMsfKeyword,
  isNegativeFiltered,
  isMsfContent,
} from "./contentFilter.js";

describe("contentFilter", () => {
  describe("containsMsfKeyword", () => {
    it("accepts titles containing MSF", () => {
      expect(containsMsfKeyword("Best MSF teams for Arena")).toBe(true);
    });

    it("accepts titles containing Marvel Strike Force", () => {
      expect(containsMsfKeyword("Marvel Strike Force Update 8.0")).toBe(true);
    });

    it("accepts titles containing Strike Force", () => {
      expect(containsMsfKeyword("Strike Force: New Character Review")).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(containsMsfKeyword("msf tier list")).toBe(true);
      expect(containsMsfKeyword("MARVEL STRIKE FORCE")).toBe(true);
    });

    it("rejects titles without MSF keywords", () => {
      expect(containsMsfKeyword("Best Marvel Rivals characters")).toBe(false);
    });
  });

  describe("isNegativeFiltered", () => {
    it("rejects Marvel Rivals titles", () => {
      expect(isNegativeFiltered("Marvel Rivals tier list", "")).toBe(true);
    });

    it("rejects Future Fight titles", () => {
      expect(isNegativeFiltered("Future Fight update review", "")).toBe(true);
    });

    it("rejects Contest of Champions titles", () => {
      expect(isNegativeFiltered("Contest of Champions tier list", "")).toBe(true);
    });

    it("rejects SWGoH titles", () => {
      expect(isNegativeFiltered("SWGoH best teams 2026", "")).toBe(true);
    });

    it("rejects Galaxy of Heroes titles", () => {
      expect(isNegativeFiltered("Galaxy of Heroes update", "")).toBe(true);
    });

    it("accepts titles without negative keywords", () => {
      expect(isNegativeFiltered("Best MSF teams", "")).toBe(false);
    });
  });

  describe("isMsfContent — combo titles", () => {
    it("keeps videos with both MSF and negative keywords in title", () => {
      // "MSF vs Marvel Rivals" — has MSF keyword, so it's kept
      expect(isMsfContent("MSF vs Marvel Rivals comparison", "")).toBe(true);
    });

    it("keeps videos with negative keyword in title but MSF in description", () => {
      expect(
        isMsfContent(
          "Marvel Rivals is bad, play this instead",
          "MSF is better than Marvel Rivals"
        )
      ).toBe(true);
    });

    it("rejects videos with negative keyword and no MSF keyword anywhere", () => {
      expect(
        isMsfContent("Marvel Rivals tier list", "Best characters to play")
      ).toBe(false);
    });

    it("accepts pure MSF content", () => {
      expect(isMsfContent("MSF new character release", "Check out the new MSF hero")).toBe(true);
    });

    it("rejects content with no keywords at all", () => {
      expect(isMsfContent("Random gaming video", "Just playing games")).toBe(false);
    });
  });
});
