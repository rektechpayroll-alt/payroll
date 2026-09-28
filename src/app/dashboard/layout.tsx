import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getCompany, getCurrentRun, getLinesForRun } from "@/lib/queries";
import { getSession } from "@/lib/tenant";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // A new user has no business yet — set one up before showing any dashboard.
  if (!session.companyId) redirect("/onboarding");

  const company = await getCompany();
  const run = await getCurrentRun();
  const lines = run ? await getLinesForRun(run.id) : [];
  const pendingCount = lines.filter((l) => l.severity && !l.resolved).length;

  return (
    <div className="grid min-h-full grid-cols-[236px_1fr] max-[760px]:grid-cols-1">
      <Sidebar
        companyId={company.id}
        companyName={company.name}
        companyMeta={`${company.employee_count} employees · ${company.pay_schedule}`}
        memberships={session.memberships}
        isAdmin={session.isAdmin}
        viewingAsAdmin={session.viewingAsAdmin}
        pendingCount={pendingCount}
      />
      <main className="px-8 pb-[60px] pt-[26px] max-[760px]:px-4">{children}</main>
    </div>
  );
}
