import { Banner } from "@/components/Banner";
import { StatRow, StatTile, MetaRow } from "@/components/StatTile";
import { ReviewPanel } from "@/components/ReviewPanel";
import { Sparkline } from "@/components/Sparkline";
import { AuditList } from "@/components/AuditList";
import { gbp, gbpCompact } from "@/lib/format";
import { getCompany, getCurrentRun, getLinesForRun, getAuditLog, getCostTrend } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const company = getCompany();
  const run = getCurrentRun();
  const lines = getLinesForRun(run.id);
  const audit = getAuditLog();
  const trend = getCostTrend();

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
            BACS cutoff in <span className="font-num">{run.bacs_cutoff_label}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-[7px] text-[12.5px] font-medium text-[var(--ink-secondary)]">
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
              <path d="M4 12a8 8 0 1 1 3 6.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M4 18v-4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Export summary
          </div>
        </div>
      </div>

      {run.mid_month_note && <Banner title="Mid-month check already ran · 14 Sep" text={run.mid_month_note} />}

      <StatRow>
        <StatTile
          label="Net pay · this run"
          value={gbp(run.net_pay)}
          meta={
            <div className="flex justify-between">
              <span>{company.employee_count} employees</span>
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
      </StatRow>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_296px]">
        <ReviewPanel initialLines={lines} totalEmployees={company.employee_count} />

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
                <span className="text-xs text-[var(--ink-muted)]">this run, +{pctChange}% vs Aug</span>
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
