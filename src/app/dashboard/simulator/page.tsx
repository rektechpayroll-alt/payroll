import { WhatIfSimulator } from "@/components/WhatIfSimulator";
import { getCompany, getCurrentRun, getEmployees, getLinesForRun, getProfitabilityStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SimulatorPage() {
  const company = await getCompany();
  const employees = await getEmployees();
  const run = await getCurrentRun();
  const lines = run ? await getLinesForRun(run.id) : [];
  const stats = await getProfitabilityStats();

  const baselineMonthlyCost = run ? run.gross_pay + run.employer_ni + run.employer_pension : 0;

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">&ldquo;What if?&rdquo; Simulator</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} · model a new hire, a raise, or a bonus round before committing to it
        </div>
      </div>
      <WhatIfSimulator
        employees={employees}
        lines={lines}
        baselineMonthlyCost={baselineMonthlyCost}
        headcount={company.employee_count}
        bonusBudget={stats.bonus_budget}
      />
    </div>
  );
}
