import { getCompany, getCurrentRun } from "@/lib/queries";

export const dynamic = "force-dynamic";

const REPORTS = [
  {
    href: "/api/reports/payroll-register",
    title: "Payroll register",
    description: "Every employee on the current run — net pay, status, source and reason for any flag.",
  },
  {
    href: "/api/reports/compliance-summary",
    title: "Statutory compliance summary",
    description: "Per-employee tax code, NI number, NMW check, and SSP/family-leave/IR35 eligibility.",
  },
  {
    href: "/api/reports/audit-trail",
    title: "Audit trail",
    description: "Every approval, HMRC submission and BACS event recorded for this company.",
  },
  {
    href: "/api/reports/cost-trend",
    title: "Cost to company · 6 months",
    description: "Monthly cost to company alongside deals-closed and headcount indices.",
  },
];

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function ReportsPage() {
  const company = await getCompany();
  const run = await getCurrentRun();

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Reports</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} · exportable CSVs generated from live payroll data{run ? ` for ${run.period_label}` : ""}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <div key={r.href} className="flex flex-col justify-between gap-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow)]">
            <div>
              <h2 className="text-[15px] font-semibold">{r.title}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-secondary)]">{r.description}</p>
            </div>
            <a
              href={r.href}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2 text-[12.5px] font-semibold hover:bg-[var(--surface-2)]"
            >
              <DownloadIcon />
              Download CSV
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
