import { getCompany, getInventoryItems } from "@/lib/queries";
import { summarizeInventory } from "@/lib/inventory";
import { InventoryHub } from "@/components/InventoryHub";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const company = await getCompany();
  const items = await getInventoryItems();
  const summary = summarizeInventory(items);

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Inventory</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} &middot; signage, branded merchandise and equipment stock — the physical inventory a lettings and
          management agency actually holds, not warehouse SKUs.
        </div>
      </div>

      <InventoryHub initialItems={items} summary={summary} />
    </div>
  );
}
