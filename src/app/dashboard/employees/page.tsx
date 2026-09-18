import { EmployeeDirectory } from "@/components/EmployeeDirectory";
import { getCompany, getCurrentRun, getEmployees, getLinesForRun } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const company = await getCompany();
  const employees = await getEmployees();
  const run = await getCurrentRun();
  const lines = run ? await getLinesForRun(run.id) : [];

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Employees</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} · {employees.length} employees
        </div>
      </div>
      <EmployeeDirectory employees={employees} lines={lines} />
    </div>
  );
}
