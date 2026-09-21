import { getCompany, getEmployees, getExpenseClaims, getMileageClaims } from "@/lib/queries";
import { ExpensesHub } from "@/components/ExpensesHub";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const company = await getCompany();
  const [employees, claims, mileage] = await Promise.all([getEmployees(), getExpenseClaims(), getMileageClaims()]);

  const pendingClaims = claims.filter((c) => c.status === "submitted");
  const pendingMileage = mileage.filter((m) => m.status === "submitted");
  const totals = {
    pendingClaims: pendingClaims.length,
    pendingClaimsTotal: pendingClaims.reduce((sum, c) => sum + c.amount, 0),
    pendingMileage: pendingMileage.length,
    pendingMileageTotal: pendingMileage.reduce((sum, m) => sum + m.amount, 0),
  };

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Expenses & mileage</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} &middot; the working half of pillar F&rsquo;s expenses portal — submit, approve and reimburse, with
          reimbursement reconciled against the connected bank feed.
        </div>
      </div>

      <ExpensesHub employees={employees} initialClaims={claims} initialMileage={mileage} totals={totals} />
    </div>
  );
}
