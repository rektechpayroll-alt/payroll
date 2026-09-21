import type { InventoryItem } from "./queries";

/** Manage Inventory — pure derived logic. */

export function isLowStock(item: InventoryItem): boolean {
  return item.quantity_on_hand <= item.reorder_level;
}

export type InventorySummary = {
  totalValue: number;
  lowStockCount: number;
};

export function summarizeInventory(items: InventoryItem[]): InventorySummary {
  return {
    totalValue: items.reduce((sum, it) => sum + it.quantity_on_hand * it.unit_cost, 0),
    lowStockCount: items.filter(isLowStock).length,
  };
}
