import { Sidebar } from "@/components/Sidebar";
import { getCompany, getCurrentRun, getLinesForRun } from "@/lib/queries";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const company = getCompany();
  const run = getCurrentRun();
  const lines = getLinesForRun(run.id);
  const pendingCount = lines.filter((l) => l.severity && !l.resolved).length;

  return (
    <div className="grid min-h-full grid-cols-[236px_1fr] max-[760px]:grid-cols-1">
      <Sidebar companyName={company.name} companyMeta={`${company.employee_count} employees · ${company.pay_schedule}`} pendingCount={pendingCount} />
      <main className="px-8 pb-[60px] pt-[26px] max-[760px]:px-4">{children}</main>
    </div>
  );
}
