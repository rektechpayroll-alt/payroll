import { getCompany, getCurrentRun, getLinesForRun, getEmployees, getCloseTasks } from "@/lib/queries";
import { complianceSweep } from "@/lib/compliance";
import { AgentsHub } from "@/components/AgentsHub";
import type { PayrollLine } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const [company, run, employees, closeTasks] = await Promise.all([
    getCompany(),
    getCurrentRun(),
    getEmployees(),
    getCloseTasks(),
  ]);
  const lines = run ? await getLinesForRun(run.id) : [];

  const lineByEmployeeId = new Map<string, PayrollLine>();
  lines.forEach((l) => {
    if (l.employee_id) lineByEmployeeId.set(l.employee_id, l);
  });

  const complianceExceptions = complianceSweep(employees, lineByEmployeeId);
  const flaggedLines = lines.filter((l) => l.severity && !l.resolved);

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">AI agents</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} · task-specific agents working against this run's real data, not a general chatbot
        </div>
      </div>

      <AgentsHub complianceExceptions={complianceExceptions} flaggedLines={flaggedLines} closeTasks={closeTasks} />
    </div>
  );
}
