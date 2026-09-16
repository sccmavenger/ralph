import { describe, expect, it } from "vitest";
import {
  activeNavigationHref,
  isNavigationRoute,
  MORE_NAVIGATION,
  PRIMARY_NAVIGATION,
} from "./app-navigation";

describe("shared app navigation", () => {
  it("keeps the approved four destinations in a stable order", () => {
    expect(PRIMARY_NAVIGATION.map(({ label }) => label)).toEqual([
      "Today", "Roster", "Resources", "Planner",
    ]);
  });

  it.each(PRIMARY_NAVIGATION)("activates $label for exact and child routes", ({ href }) => {
    expect(activeNavigationHref(href)).toBe(href);
    expect(activeNavigationHref(`${href}/child`)).toBe(href);
    expect(activeNavigationHref(`${href}/child/grandchild`)).toBe(href);
  });

  it.each(MORE_NAVIGATION)("keeps $label available in More with correct nested matching", ({ href }) => {
    expect(activeNavigationHref(href)).toBeNull();
    expect(activeNavigationHref(`${href}/child`)).toBeNull();
    expect(isNavigationRoute(`${href}/child`, href)).toBe(true);
  });

  it("does not activate a destination for an unrelated prefix", () => {
    expect(isNavigationRoute("/roster-tools", "/roster")).toBe(false);
    expect(isNavigationRoute("/analyzer", "/analyze")).toBe(false);
    expect(activeNavigationHref("/inventory-history")).toBeNull();
  });
});
