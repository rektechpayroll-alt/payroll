import { getCompany, getBills, getPurchaseOrders } from "@/lib/queries";
import { withBillOverdueStatus, summarizePayables } from "@/lib/purchasing";
import { PurchasingHub } from "@/components/PurchasingHub";

export const dynamic = "force-dynamic";

export default async function PurchasingPage() {
  const company = await getCompany();
  const [rawBills, purchaseOrders] = await Promise.all([getBills(), getPurchaseOrders()]);
  const bills = rawBills.map((b) => withBillOverdueStatus(b));
  const summary = summarizePayables(bills);

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Purchasing</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} &middot; supplier bills and purchase orders — the accounts-payable side of Verity Ledger. Paying a
          bill reconciles against the same connected bank feed as sales invoices.
        </div>
      </div>

      <PurchasingHub initialBills={bills} initialPurchaseOrders={purchaseOrders} summary={summary} />
    </div>
  );
}
