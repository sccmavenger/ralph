import { describe, expect, it } from "vitest";
import {
  filterInventory,
  INVENTORY_CATEGORIES,
  parseInventory,
  sortInventory,
  type InventoryItem,
} from "./inventory-view";

function item(id: string, quantity: number | null, name: string | null = id): InventoryItem {
  return { id, quantity, name, category: "Other", icon: null };
}

describe("parseInventory", () => {
  it("retains every supported category, including orbs, currency, and ISO-8", () => {
    const data = INVENTORY_CATEGORIES.map((category, index) => ({
      id: `item-${index}`,
      category,
      quantity: index,
    }));
    expect(parseInventory({ data }).map(entry => entry.category)).toEqual(INVENTORY_CATEGORIES);
  });

  it("normalizes category case and keeps unknown categories visible under Other", () => {
    const parsed = parseInventory({ data: [
      { id: "orb", category: "orbs" },
      { id: "currency", category: "CURRENCY" },
      { id: "iso", category: "iso-8 items" },
      { id: "unknown", category: "Unrecognized" },
      { id: "missing" },
    ] });
    expect(parsed.map(entry => entry.category)).toEqual(["Orbs", "Currency", "ISO-8 Items", "Other", "Other"]);
  });

  it("preserves explicit zero and positive quantities without replacing unknown balances", () => {
    const parsed = parseInventory({ data: [
      { id: "zero", quantity: 0 },
      { id: "positive", quantity: 1_234_567 },
      { id: "null", quantity: null },
      { id: "absent" },
    ] });
    expect(parsed.map(entry => entry.quantity)).toEqual([0, 1_234_567, null, null]);
  });

  it.each(["12", -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, true, {}])(
    "treats unsupported quantity %j as unavailable rather than zero",
    quantity => {
      expect(parseInventory({ data: [{ id: "item", quantity }] })[0].quantity).toBeNull();
    },
  );

  it("normalizes optional display metadata without inventing names", () => {
    const parsed = parseInventory({ data: [
      { id: "named", name: "  Gold Orb  ", icon: "https://assets.example.com/gold.png" },
      { id: "unnamed", name: "  ", icon: "javascript:alert(1)" },
      { id: "no-metadata" },
      { id: "insecure", icon: "http://assets.example.com/item.png" },
    ] });
    expect(parsed[0]).toMatchObject({ name: "Gold Orb", icon: "https://assets.example.com/gold.png" });
    expect(parsed.slice(1).map(entry => [entry.name, entry.icon])).toEqual([
      [null, null], [null, null], [null, null],
    ]);
  });

  it("accepts a valid empty inventory", () => {
    expect(parseInventory({ data: [] })).toEqual([]);
  });

  it.each([
    undefined,
    null,
    "unavailable",
    [],
    {},
    { data: null },
    { data: {} },
    { data: [], error: "Inventory unavailable" },
    { data: [null] },
    { data: ["item-id"] },
    { data: [{}] },
    { data: [{ id: 42 }] },
    { data: [{ id: "   " }] },
    { data: [{ id: "valid" }, { name: "Invalid entry" }] },
  ])("throws for malformed or incomplete payloads instead of returning empty: %j", payload => {
    expect(() => parseInventory(payload)).toThrow(/Inventory data/);
  });

  it("deduplicates repeated IDs without adding their balances", () => {
    const parsed = parseInventory({ data: [
      { id: "a", name: "Old name", quantity: 10, category: "Gear" },
      { id: "b", quantity: 2 },
      { id: "a", name: "Latest name", quantity: 8, category: "Gear" },
    ] });
    expect(parsed.map(entry => entry.id)).toEqual(["a", "b"]);
    expect(parsed[0]).toMatchObject({ name: "Latest name", quantity: 8 });
  });

  it("does not mutate the input entries or array while normalizing and deduplicating", () => {
    const first = Object.freeze({ id: "a", name: "  Name  ", quantity: 1 });
    const replacement = Object.freeze({ id: "a", name: "Replacement", quantity: 2 });
    const data = Object.freeze([first, replacement]);
    const source = Object.freeze({ data });
    const parsed = parseInventory(source);
    expect(data).toEqual([first, replacement]);
    expect(first.name).toBe("  Name  ");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).not.toBe(replacement);
  });
});

describe("filterInventory", () => {
  const entries = [
    item("GEAR_TECH_17", 24, "Augmented Focus Catalyst"),
    item("GEAR_BIO_16", 0, "Superior Focus Catalyst"),
    item("ISO_BLUE", null, "Blue ISO-8 Crystal"),
    item("UNNAMED_MATERIAL_4", 3, null),
  ];

  it("matches every search word across both the display name and item ID", () => {
    expect(filterInventory(entries, "  augmented   TECH_17  ", false).map(entry => entry.id)).toEqual(["GEAR_TECH_17"]);
    expect(filterInventory(entries, "FoCuS catalyst", false).map(entry => entry.id)).toEqual(["GEAR_TECH_17", "GEAR_BIO_16"]);
    expect(filterInventory(entries, "FOCUS missing", false)).toEqual([]);
  });

  it("can find items that only have an ID", () => {
    expect(filterInventory(entries, "unnamed material_4", false).map(entry => entry.id)).toEqual(["UNNAMED_MATERIAL_4"]);
  });

  it("retains zero and unknown balances unless in-stock-only is selected", () => {
    expect(filterInventory(entries, "", false)).toHaveLength(4);
    expect(filterInventory(entries, "   ", true).map(entry => entry.id)).toEqual(["GEAR_TECH_17", "UNNAMED_MATERIAL_4"]);
    expect(filterInventory(entries, "focus", true).map(entry => entry.id)).toEqual(["GEAR_TECH_17"]);
    expect(filterInventory(entries, "blue", true)).toEqual([]);
  });

  it("does not mutate the source array when filtering", () => {
    const source = [...entries];
    Object.freeze(source);
    const filtered = filterInventory(source, "focus", false);
    expect(source).toEqual(entries);
    expect(filtered).not.toBe(source);
  });
});

describe("sortInventory", () => {
  const entries = [
    item("unknown-z", null, "Unknown Z"),
    item("larger", 200, "Large"),
    item("zero", 0, "Zero"),
    item("tie-b", 10, "Beta"),
    item("unknown-a", null, "Unknown A"),
    item("tie-a", 10, "Alpha"),
  ];

  it("sorts quantities ascending with unavailable balances last and name tie-breaks", () => {
    expect(sortInventory(entries, "quantity-asc").map(entry => entry.id)).toEqual([
      "zero", "tie-a", "tie-b", "larger", "unknown-a", "unknown-z",
    ]);
  });

  it("sorts quantities descending without moving unavailable balances to the front", () => {
    expect(sortInventory(entries, "quantity-desc").map(entry => entry.id)).toEqual([
      "larger", "tie-a", "tie-b", "zero", "unknown-a", "unknown-z",
    ]);
  });

  it("sorts names naturally and falls back to the item ID", () => {
    const named = [item("ten", 1, "Material 10"), item("Material 3", 2, null), item("two", null, "Material 2")];
    expect(sortInventory(named, "name").map(entry => entry.id)).toEqual(["two", "Material 3", "ten"]);
  });

  it("leaves the input array and objects untouched for every sort mode", () => {
    const source = entries.map(entry => Object.freeze({ ...entry }));
    Object.freeze(source);
    for (const mode of ["name", "quantity-asc", "quantity-desc"] as const) {
      const sorted = sortInventory(source, mode);
      expect(sorted).not.toBe(source);
      expect(source).toEqual(entries);
      expect(sorted).toHaveLength(source.length);
    }
  });
});
