import { getCompany, getBudgetLines, getBills, getExpenseClaims, getMileageClaims, getBankTransactions } from "@/lib/queries";
import { computeBudgetActuals } from "@/lib/budget";
import { BudgetHub } from "@/components/BudgetHub";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const company = await getCompany();
  const [lines, bills, expenseClaims, mileageClaims, bankTransactions] = await Promise.all([
    getBudgetLines(),
    getBills(),
    getExpenseClaims(),
    getMileageClaims(),
    getBankTransactions(),
  ]);
  const withActuals = computeBudgetActuals(lines, bills, expenseClaims, mileageClaims, bankTransactions);
  const periodLabel = lines[0]?.period_label ?? "Q3 2026";

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Budget</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} &middot; category budgets checked live against real spend across Purchasing and Expenses &mdash;
          no spreadsheet someone reconciles at month end.
        </div>
      </div>

      <BudgetHub initialLines={withActuals} periodLabel={periodLabel} />
    </div>
  );
}
