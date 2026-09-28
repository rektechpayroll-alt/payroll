import { Banner } from "@/components/Banner";
import { StatRow, StatTile, MetaRow } from "@/components/StatTile";
import { ReviewPanel } from "@/components/ReviewPanel";
import { Sparkline } from "@/components/Sparkline";
import { AuditList } from "@/components/AuditList";
import { BusinessSnapshot } from "@/components/BusinessSnapshot";
import { EmptyState } from "@/components/EmptyState";
import Link from "next/link";
import { gbp, gbpCompact } from "@/lib/format";
import { getCompany, getCurrentRun, getLinesForRun, getAuditLog, getCostTrend, getInvoices, getBills } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const company = await getCompany();
  const run = await getCurrentRun();
  if (!run) {
    return (
      <EmptyState
        title={`Welcome to ${company.name}`}
        heading="No payroll run yet"
        note="Your books are set up and empty. Add your employees and customers to get started — your first pay run will appear here for review and approval."
        actions={[
          { href: "/dashboard/payroll/new", label: "Run payroll" },
          { href: "/dashboard/employees", label: "Add employees" },
          { href: "/dashboard/contacts", label: "Add contacts" },
          { href: "/dashboard/ledger", label: "Raise an invoice" },
        ]}
      />
    );
  }
  const lines = await getLinesForRun(run.id);
  const audit = await getAuditLog();
  const trend = await getCostTrend();
  const [invoices, bills] = await Promise.all([getInvoices(), getBills()]);
  const arOutstanding = invoices.filter((i) => i.status === "sent").reduce((sum, i) => sum + i.total, 0);
  const apOutstanding = bills.filter((b) => b.status === "unpaid").reduce((sum, b) => sum + b.total, 0);

  const calculated = run.source === "engine";
  const headroom = run.connected_balance - run.net_pay;
  const lastMonthCost = trend[trend.length - 2]?.cost_to_company ?? run.gross_pay;
  const pctChange = (((run.gross_pay + run.employer_ni + run.employer_pension - lastMonthCost) / lastMonthCost) * 100).toFixed(1);

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Payroll approval</h1>
          <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
            {run.period_label} · Pay period {run.pay_period} · Payday <span className="font-num text-[var(--ink)]">{run.payday}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--warning-soft)] px-3 py-[7px] text-[12.5px] font-semibold text-[var(--warning-ink)]">
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            BACS cutoff {calculated ? "" : "in "}
            <span className="font-num">{run.bacs_cutoff_label}</span>
          </div>
          {calculated ? (
            <Link
              href={`/dashboard/payroll/${run.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-[7px] text-[12.5px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)]"
            >
              Payslips &amp; breakdown
            </Link>
          ) : null}
          {run.status !== "open" && (
            <Link
              href="/dashboard/payroll/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-[7px] text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
            >
              Run payroll
            </Link>
          )}
        </div>
      </div>

      {run.mid_month_note && <Banner title="Mid-month check already ran · 14 Sep" text={run.mid_month_note} />}

      {!calculated && <BusinessSnapshot bankBalance={run.connected_balance} arOutstanding={arOutstanding} apOutstanding={apOutstanding} />}

      <StatRow>
        <StatTile
          label="Net pay · this run"
          value={gbp(run.net_pay)}
          meta={
            <div className="flex justify-between">
              <span>{calculated ? lines.length : company.employee_count} employees</span>
              <span>Faster Payments ready</span>
            </div>
          }
        />
        <StatTile
          label="Total cost to company"
          value={gbp(run.gross_pay + run.employer_ni + run.employer_pension)}
          meta={
            <>
              <MetaRow label="Gross pay" value={gbp(run.gross_pay)} />
              <MetaRow label="Employer NI" value={gbp(run.employer_ni)} />
              <MetaRow label="Employer pension" value={gbp(run.employer_pension)} />
            </>
          }
        />
        {calculated ? (
          <StatTile
            label="Deductions · this run"
            value={gbp(run.gross_pay - run.net_pay)}
            meta={
              <>
                <MetaRow label="Income tax" value={gbp(run.total_tax)} />
                <MetaRow label="Employee NI" value={gbp(run.total_employee_ni)} />
                <MetaRow label="Pension + loans" value={gbp(run.total_employee_pension + run.total_student_loan)} />
              </>
            }
          />
        ) : (
        <StatTile
          label="Funds check · BACS run"
          value={gbp(run.net_pay)}
          meta={<MetaRow label="Connected account" value={gbp(run.connected_balance)} />}
          pill={{
            tone: "good",
            icon: (
              <svg viewBox="0 0 24 24" fill="none" className="h-[11px] w-[11px]">
                <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ),
            text: `${gbp(headroom)} headroom`,
          }}
        />
        )}
      </StatRow>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_296px]">
        <ReviewPanel
          initialLines={lines}
          totalEmployees={calculated ? lines.length : company.employee_count}
          engineRunId={calculated && run.status === "open" ? run.id : undefined}
        />

        <aside className="flex flex-col gap-3.5">
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
            <div className="border-b border-[var(--border)] px-4 py-[15px] pb-[13px]">
              <h2 className="font-display text-[14.5px] font-semibold">Cost to company · 6 months</h2>
            </div>
            <div className="px-4 py-3.5 pb-4">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="font-display text-[19px] font-semibold font-num">
                  {gbpCompact(run.gross_pay + run.employer_ni + run.employer_pension)}
                </span>
                <span className="text-xs text-[var(--ink-muted)]">this run, {Number(pctChange) >= 0 ? "+" : ""}{pctChange}% vs last month</span>
              </div>
              <Sparkline labels={trend.map((t) => t.month_label)} series={[{ values: trend.map((t) => t.cost_to_company), colorVar: "--series-1" }]} />
            </div>
          </div>

          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
            <div className="border-b border-[var(--border)] px-4 py-[15px] pb-[13px]">
              <h2 className="font-display text-[14.5px] font-semibold">Audit trail</h2>
            </div>
            <div className="px-4 py-3.5 pb-4">
              <AuditList entries={audit} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
