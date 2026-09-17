import { StatRow, StatTile, MetaRow } from "@/components/StatTile";
import { Sparkline, ChartLegend } from "@/components/Sparkline";
import { RecommendationList } from "@/components/RecommendationList";
import { gbp } from "@/lib/format";
import { getCompany, getCostTrend, getProfitabilityStats, getRecommendations } from "@/lib/queries";

export const dynamic = "force-dynamic";

function WarnPillIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[11px] w-[11px]">
      <path d="M12 3l9 16H3L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 10v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ClockPillIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[11px] w-[11px]">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default async function ProfitabilityPage() {
  const company = await getCompany();
  const trend = await getCostTrend();
  const stats = await getProfitabilityStats();
  const recs = await getRecommendations();

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Profitability index</h1>
          <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
            {company.name} · based on the last 6 months of activity
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-[7px] text-[12.5px] font-medium text-[var(--ink-secondary)]">
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
            <path d="M4 17l5-5 4 4 7-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 6h5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Updated with every payroll run
        </div>
      </div>

      <StatRow>
        <StatTile label="Bonus budget available" value={gbp(stats.bonus_budget)} meta={<div>{stats.bonus_budget_note}</div>} />
        <StatTile
          label={`Optimum salary · ${stats.optimum_role}`}
          value={`£${(stats.optimum_salary_low / 1000).toFixed(1)}–${(stats.optimum_salary_high / 1000).toFixed(1)}k`}
          meta={<MetaRow label="Currently paid" value={gbp(stats.optimum_salary_current)} />}
          pill={{ tone: "warn", icon: <WarnPillIcon />, text: "Below local market" }}
        />
        <StatTile
          label="Staffing vs demand"
          value={`+${stats.staffing_fte_delta} FTE`}
          meta={<div>{stats.staffing_note}</div>}
          pill={{ tone: "warn", icon: <ClockPillIcon />, text: stats.staffing_flag }}
        />
      </StatRow>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_296px]">
        <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="border-b border-[var(--border)] px-[18px] py-[15px] pb-[13px]">
            <h2 className="font-display text-[16.5px] font-semibold">Deals closed vs headcount</h2>
            <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Indexed to April 2026 · one shared axis</div>
          </div>
          <div className="px-4 py-3.5 pb-4">
            <Sparkline
              labels={trend.map((t) => t.month_label)}
              series={[
                { values: trend.map((t) => t.deals_index), colorVar: "--series-1" },
                { values: trend.map((t) => t.headcount_index), colorVar: "--series-2" },
              ]}
            />
            <ChartLegend
              items={[
                { label: "Deals closed", colorVar: "--series-1" },
                { label: "Headcount", colorVar: "--series-2" },
              ]}
            />
          </div>
        </section>

        <aside>
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
            <div className="border-b border-[var(--border)] px-4 py-[15px] pb-[13px]">
              <h2 className="font-display text-[14.5px] font-semibold">Recommendations</h2>
            </div>
            <div className="px-4 py-3.5 pb-4">
              <RecommendationList items={recs.map((r) => r.body)} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
