export const INVENTORY_CATEGORIES = ["Gear", "Shards", "Ability Materials", "Training Materials", "ISO-8 Items", "Orbs", "Currency", "Consumables", "Other"] as const;
export type InventoryCategory = typeof INVENTORY_CATEGORIES[number];
export type InventorySort = "name" | "quantity-desc" | "quantity-asc";
export interface InventoryItem {
  id: string;
  name: string | null;
  quantity: number | null;
  category: InventoryCategory;
  icon: string | null;
}

export function parseInventory(value: unknown): InventoryItem[] {
  if (!value || typeof value !== "object" || !("data" in value) || !Array.isArray(value.data) || ("error" in value && value.error != null)) throw new Error("Inventory data is unavailable. Please try again.");
  const items = value.data.map((item: unknown): InventoryItem => {
    if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string" || !item.id.trim()) throw new Error("Inventory data is incomplete. Please try again.");
    const raw = item as Record<string, unknown>;
    return {
      id: item.id,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null,
      quantity: typeof raw.quantity === "number" && Number.isSafeInteger(raw.quantity) && raw.quantity >= 0 ? raw.quantity : null,
      category: INVENTORY_CATEGORIES.find(c => c.toLowerCase() === String(raw.category ?? "").toLowerCase()) ?? "Other",
      icon: typeof raw.icon === "string" && /^https:\/\//i.test(raw.icon) ? raw.icon : null,
    };
  });
  return [...new Map(items.map(item => [item.id, item])).values()];
}

export function filterInventory(items: InventoryItem[], search: string, inStockOnly: boolean) {
  const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    const text = `${item.name ?? ""} ${item.id}`.toLocaleLowerCase();
    return (!inStockOnly || (item.quantity !== null && item.quantity > 0)) && words.every(word => text.includes(word));
  });
}

export function sortInventory(items: InventoryItem[], sort: InventorySort) {
  return [...items].sort((a, b) => {
    if (sort !== "name") {
      if (a.quantity === null && b.quantity !== null) return 1;
      if (b.quantity === null && a.quantity !== null) return -1;
      const difference = (a.quantity ?? 0) - (b.quantity ?? 0);
      if (difference) return sort === "quantity-asc" ? difference : -difference;
    }
    return (a.name ?? a.id).localeCompare(b.name ?? b.id, "en", { numeric: true });
  });
}
