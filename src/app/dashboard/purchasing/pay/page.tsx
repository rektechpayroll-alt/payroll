import Link from "next/link";
import { BankForm, BatchActions, PayBills } from "@/components/PaymentsHub";
import { FORMAT_LABELS, getBankDetails, listPaymentBatches, listSupplierBanks, payableBills } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

const card = "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]";

export default async function PaySuppliersPage() {
  const [bank, bills, suppliers, batches] = await Promise.all([getBankDetails(), payableBills(), listSupplierBanks(), listPaymentBatches()]);
  const today = new Date().toISOString().slice(0, 10);
  const owed = new Set(bills.map((b) => b.supplier.trim().toLowerCase()));
  // Suppliers you owe money to first, then the rest.
  const sorted = [...suppliers].sort((a, b) => Number(owed.has(b.name.toLowerCase())) - Number(owed.has(a.name.toLowerCase())));

  return (
    <div>
      <div className="mb-2 text-[12.5px]">
        <Link href="/dashboard/purchasing" className="font-semibold text-[var(--accent-strong)]">
          ← Purchasing
        </Link>
      </div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Pay suppliers</h1>
        <div className="mt-1 max-w-[760px] text-[13px] text-[var(--ink-secondary)]">
          Pick the bills to pay and download a file for your bank&rsquo;s bulk payment upload — CSV or Bacs for UK sterling payments, ISO 20022 pain.001 for SEPA and
          international ones. Verity never moves money itself: you upload the file and approve it in your bank. Once the bank accepts it, mark the file paid.
        </div>
      </div>

      <section className={`${card} mb-4`}>
        <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
          <h2 className="font-display text-[14.5px] font-semibold">Bills to pay</h2>
        </div>
        <PayBills bills={bills} formats={FORMAT_LABELS} today={today} />
      </section>

      {batches.length > 0 && (
        <section className={`${card} mb-4`}>
          <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Payment files</h2>
          </div>
          {batches.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-[18px] py-2.5 text-[12.5px] last:border-b-0">
              <span>
                <strong>{b.reference}</strong> · {b.count} payment{b.count === 1 ? "" : "s"} · {b.totals} · paying {b.executionDate}
                <span className="block text-[11px] text-[var(--ink-muted)]">
                  {FORMAT_LABELS[b.format]} · made {b.createdAt}
                  {b.createdBy ? ` by ${b.createdBy}` : ""} · <span className="capitalize">{b.status === "created" ? "waiting for the bank" : b.status}</span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                <a href={`/api/payments/batch/file?id=${b.id}`} className="text-[12px] font-semibold text-[var(--accent-strong)] hover:underline">
                  Download
                </a>
                {b.status === "created" && <BatchActions id={b.id} />}
              </span>
            </div>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className={card}>
          <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Your bank account</h2>
            <div className="text-xs text-[var(--ink-muted)]">Paid from, and printed on your invoices. IBAN and BIC are needed for pain.001 files.</div>
          </div>
          <div className="px-[18px] py-3">
            <BankForm url="/api/payments/bank-details" initial={bank} />
          </div>
        </section>
        <section className={card}>
          <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Supplier bank details</h2>
          </div>
          {sorted.length === 0 ? (
            <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">No suppliers yet.</div>
          ) : (
            sorted.map((s) => (
              <div key={s.name} className="border-b border-[var(--border)] px-[18px] py-2.5 text-[12.5px] last:border-b-0">
                <div className="mb-1 flex flex-wrap justify-between gap-2">
                  <strong>{s.name}</strong>
                  <span className="font-num text-[var(--ink-secondary)]">
                    {s.sortCode ? `${s.sortCode.replace(/(\d{2})(\d{2})(\d{2})/, "$1-$2-$3")} ${s.accountNumber}` : ""}
                    {s.sortCode && s.iban ? " · " : ""}
                    {s.iban ?? ""}
                    {!s.sortCode && !s.iban ? <span className="text-[var(--ink-muted)]">no bank details</span> : null}
                  </span>
                </div>
                <BankForm url="/api/payments/supplier-bank" name={s.name} initial={s} compact />
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
