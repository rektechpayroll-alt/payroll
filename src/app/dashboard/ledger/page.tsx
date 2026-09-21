import { getCompany, getInvoices, getBankTransactions, getQuotes } from "@/lib/queries";
import { withOverdueStatus, summarizeLedger, suggestMatches } from "@/lib/ledger";
import { LedgerHub } from "@/components/LedgerHub";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const company = await getCompany();
  const [rawInvoices, transactions, quotes] = await Promise.all([getInvoices(), getBankTransactions(), getQuotes()]);

  const invoices = rawInvoices.map((inv) => withOverdueStatus(inv));
  const summary = summarizeLedger(invoices, transactions);
  const suggestions = Object.fromEntries(suggestMatches(rawInvoices, transactions));

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Verity Ledger</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} &middot; quotes, sales invoicing, card/bank payment and reconciliation, connected to the same Open
          Banking feed payroll reconciles against. VAT / Making Tax Digital submission is still on the roadmap — see /product.
        </div>
      </div>

      <LedgerHub initialInvoices={invoices} initialQuotes={quotes} transactions={transactions} summary={summary} suggestions={suggestions} />
    </div>
  );
}
