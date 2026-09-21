import Link from "next/link";
import { notFound } from "next/navigation";
import { gbp } from "@/lib/format";
import { getEmployeeById, getCurrentLineForEmployee, getOnboardingTasks } from "@/lib/queries";
import { nmwCheck, statutoryEligibility } from "@/lib/compliance";
import { PayslipExplainer } from "@/components/PayslipExplainer";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { EmployeeProfileCard } from "@/components/EmployeeProfileCard";

export const dynamic = "force-dynamic";

function CheckBadge({ pass, label }: { pass: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        background: pass ? "var(--good-soft)" : "var(--critical-soft)",
        color: pass ? "var(--good-ink)" : "var(--critical-ink)",
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
        {pass ? (
          <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M12 3l9 16H3L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        )}
      </svg>
      {label}
    </span>
  );
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employee = await getEmployeeById(id);
  if (!employee) notFound();

  const line = await getCurrentLineForEmployee(id);
  const statutory = statutoryEligibility(employee);
  const nmw = line ? nmwCheck(employee, line) : null;
  const onboardingTasks = await getOnboardingTasks(id);

  return (
    <div>
      <Link href="/dashboard/employees" className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)]">
        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Employees
      </Link>

      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold">{employee.name}</h1>
          <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
            {employee.role} · {employee.employment_type} · {employee.weekly_hours}h/week
          </div>
        </div>
        {line?.net_pay != null && (
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-right shadow-[var(--shadow)]">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Net pay · this run</div>
            <div className="font-num text-[20px] font-semibold">{gbp(line.net_pay)}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
        <EmployeeProfileCard initialEmployee={employee} line={line} />

        <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="border-b border-[var(--border)] px-[18px] py-[15px] pb-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Compliance</h2>
          </div>
          <div className="flex flex-col gap-3 px-[18px] py-4 text-[13px]">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold">National Minimum Wage</span>
                {nmw ? (
                  <CheckBadge pass={nmw.pass} label={nmw.pass ? "Above floor" : "Below floor"} />
                ) : (
                  <span className="text-[11px] text-[var(--ink-muted)]">No current run</span>
                )}
              </div>
              {nmw && (
                <p className="text-[12.5px] text-[var(--ink-secondary)]">
                  Estimated effective rate <span className="font-num font-semibold">£{nmw.rate.toFixed(2)}/hr</span> against a{" "}
                  <span className="font-num">£{nmw.floor.toFixed(2)}/hr</span> floor. Illustrative — derived from net pay, not a real tax calculation.
                </p>
              )}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold">Statutory family leave (SMP/SPP/SAP/ShPP)</span>
                <CheckBadge pass={statutory.familyLeave.eligible} label={statutory.familyLeave.eligible ? "Qualifies" : "Not yet"} />
              </div>
              <p className="text-[12.5px] text-[var(--ink-secondary)]">{statutory.familyLeave.note}</p>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold">Statutory Sick Pay</span>
                <CheckBadge pass={statutory.ssp.eligible} label="Eligible" />
              </div>
              <p className="text-[12.5px] text-[var(--ink-secondary)]">{statutory.ssp.note}</p>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold">IR35</span>
                <span className="inline-flex items-center rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-secondary)]">
                  {statutory.ir35.status}
                </span>
              </div>
              <p className="text-[12.5px] text-[var(--ink-secondary)]">{statutory.ir35.note}</p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-[18px]">
        <OnboardingChecklist initialTasks={onboardingTasks} />
      </div>

      <div className="mt-[18px]">
        <PayslipExplainer employee={employee} line={line} />
      </div>
    </div>
  );
}
