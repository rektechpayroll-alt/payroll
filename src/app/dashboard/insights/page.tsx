import Link from "next/link";
import type { ReactNode } from "react";
import { BalanceChart, BarList, ChartLegend, IncomeCostsChart, ScoreRing } from "@/components/Charts";
import { DashboardCustomiser } from "@/components/InsightsHub";
import { bankSummary } from "@/lib/banking/bank";
import { gbp } from "@/lib/format";
import { budgetYear, businessInsights, getDashboardLayout, monthlyTotals, WIDGETS, type InsightPeriod, type WidgetKey } from "@/lib/insights/data";
import type { Kpi } from "@/lib/insights/kpis";
import { accountBalances, aged, AGED_BUCKETS } from "@/lib/ledger/reports";
import { calculateVatReturn, getVatSettings, vatPeriods } from "@/lib/vat/returns";

export const dynamic = "force-dynamic";

const card = "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]";
const niceDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function formatKpi(k: Kpi): string {
  if (k.value === null) return "—";
  switch (k.format) {
    case "money":
      return gbp(k.value);
    case "percent":
      return `${k.value.toFixed(1)}%`;
    case "ratio":
      return k.value.toFixed(2);
    case "days":
      return `${k.value} days`;
    case "months":
      return `${k.value.toFixed(1)} months`;
  }
}

function Widget({ title, link, wide, children }: { title: string; link?: { href: string; label: string }; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`${card} flex flex-col ${wide ? "lg:col-span-2" : ""}`}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-[18px] py-[12px]">
        <h2 className="font-display text-[14.5px] font-semibold">{title}</h2>
        {link && (
          <Link href={link.href} className="text-[12px] font-semibold text-[var(--accent-strong)] hover:underline">
            {link.label} →
          </Link>
        )}
      </div>
      <div className="flex-1 px-[18px] py-3.5">{children}</div>
    </section>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const wanted = Number((await searchParams).months);
  const months: InsightPeriod = wanted === 1 || wanted === 3 ? wanted : 12;
  const today = new Date().toISOString().slice(0, 10);
  const layout = await getDashboardLayout();
  const needs = (w: WidgetKey) => layout.includes(w);

  const [ins, monthly, receivables, payables, budget, bank, vat] = await Promise.all([
    businessInsights(months, today),
    needs("incomeCosts") ? monthlyTotals(12, today) : null,
    needs("receivables") ? aged("receivables", today) : null,
    needs("payables") ? aged("payables", today) : null,
    needs("budget") ? budgetYear(`${today.slice(0, 4)}-01`) : null,
    needs("bank") ? bankSummary() : null,
    needs("vat") ? getVatSettings() : null,
  ]);
  const topCosts = needs("topCosts")
    ? (await accountBalances(ins.from, ins.to)).filter((a) => a.type === "expense" && a.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 6)
    : [];
  let nextVat: { start: string; end: string; dueDate: string; amount: number; payable: boolean; open: boolean } | null = null;
  if (vat?.vat_registered) {
    const p = (await vatPeriods(today)).filter((x) => x.status !== "submitted").sort((a, b) => (a.end < b.end ? -1 : 1))[0];
    if (p) {
      const boxes = p.boxes ?? (await calculateVatReturn(p.start, p.end)).boxes;
      nextVat = { start: p.start, end: p.end, dueDate: p.dueDate, amount: boxes.box5 / 100, payable: boxes.payable, open: p.status === "open" };
    }
  }

  const render: Record<WidgetKey, () => ReactNode> = {
    health: () => (
      <Widget title="Financial health" wide>
        {ins.health.areas.length === 0 ? (
          <div className="text-[13px] text-[var(--ink-muted)]">Not enough in your books yet to score — this fills in as you invoice, pay bills and run payroll.</div>
        ) : (
          <div className="flex flex-wrap items-start gap-5">
            <ScoreRing score={ins.health.score} grade={ins.health.grade} />
            <div className="grid min-w-[260px] flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2">
              {ins.health.areas.map((a) => (
                <div key={a.key} className="rounded-[10px] bg-[var(--surface-2)] px-3 py-2">
                  <div className="flex items-center justify-between text-[12.5px] font-semibold">
                    {a.label}
                    <span style={{ color: a.score >= 65 ? "var(--good-ink)" : a.score >= 50 ? "var(--warning-ink)" : "var(--critical-ink)" }}>{a.score}</span>
                  </div>
                  <div className="text-[12px] text-[var(--ink-secondary)]">{a.headline}</div>
                  <div className="mt-0.5 text-[11.5px] text-[var(--ink-muted)]">{a.advice}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Widget>
    ),
    kpis: () => (
      <Widget title={`Key ratios — ${ins.label}`} wide>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {ins.kpis.map((k) => (
            <div key={k.key} className="rounded-[10px] bg-[var(--surface-2)] px-3 py-2" title={k.explain}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{k.label}</div>
              <div className="font-num mt-0.5 text-[16px] font-semibold">{formatKpi(k)}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11.5px] text-[var(--ink-muted)]">Hover a ratio for what it means.</div>
      </Widget>
    ),
    cashForecast: () => (
      <Widget title="Cash — next 90 days" link={{ href: "/dashboard/cashflow", label: "Forecast" }}>
        <div className="mb-1 flex flex-wrap gap-x-4 text-[12.5px]">
          <span>
            Today <strong className="font-num">{gbp(ins.forecast.opening / 100)}</strong>
          </span>
          <span>
            Lowest <strong className="font-num" style={{ color: ins.forecast.lowest.balance < 0 ? "var(--critical-ink)" : undefined }}>{gbp(ins.forecast.lowest.balance / 100)}</strong>
          </span>
          <span>
            In 90 days <strong className="font-num">{gbp(ins.forecast.closing / 100)}</strong>
          </span>
        </div>
        <BalanceChart id="dash" points={ins.forecast.daily.map((d) => ({ date: d.date, value: d.balance / 100 }))} height={170} />
      </Widget>
    ),
    incomeCosts: () => (
      <Widget title="Income and costs — last 12 months" link={{ href: "/dashboard/accounting", label: "Accounts" }}>
        <ChartLegend items={[{ color: "var(--good-ink)", label: "Income" }, { color: "var(--critical-ink)", label: "Costs" }]} />
        <IncomeCostsChart months={monthly ?? []} height={170} />
      </Widget>
    ),
    topCosts: () => (
      <Widget title={`Where the money goes — ${ins.label}`}>
        {topCosts.length ? <BarList rows={topCosts.map((a) => ({ label: a.name, value: a.balance }))} /> : <div className="text-[13px] text-[var(--ink-muted)]">No costs recorded in this period.</div>}
      </Widget>
    ),
    receivables: () => (
      <Widget title="Money owed to you" link={{ href: "/dashboard/invoicing", label: "Invoicing" }}>
        <AgedSummary data={receivables} />
      </Widget>
    ),
    payables: () => (
      <Widget title="Money you owe" link={{ href: "/dashboard/purchasing", label: "Bills" }}>
        <AgedSummary data={payables} />
      </Widget>
    ),
    budget: () => {
      const idx = budget ? budget.months.indexOf(today.slice(0, 7)) : -1;
      const rows = budget && idx >= 0 ? budget.rows.filter((r) => r.budget[idx] > 0) : [];
      return (
        <Widget title="Budget this month" link={{ href: "/dashboard/budget", label: "Budget" }}>
          {rows.length === 0 ? (
            <div className="text-[13px] text-[var(--ink-muted)]">No budget set for this month.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.slice(0, 6).map((r) => {
                const pct = Math.round((r.actual[idx] / r.budget[idx]) * 100);
                const bad = r.section === "income" ? false : pct > 100;
                return (
                  <div key={r.code} className="text-[12.5px]">
                    <div className="mb-1 flex justify-between gap-2">
                      <span className="truncate">{r.name}</span>
                      <span className="font-num" style={{ color: bad ? "var(--critical-ink)" : undefined }}>
                        {gbp(r.actual[idx])} of {gbp(r.budget[idx])}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--surface-2)]">
                      <div className="h-2 rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: bad ? "var(--critical-ink)" : "var(--accent)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Widget>
      );
    },
    vat: () => (
      <Widget title="Next VAT return" link={{ href: "/dashboard/vat", label: "VAT" }}>
        {!vat?.vat_registered ? (
          <div className="text-[13px] text-[var(--ink-muted)]">Not VAT registered. Turn it on in VAT settings if you are.</div>
        ) : !nextVat ? (
          <div className="text-[13px] text-[var(--ink-muted)]">Every return is filed.</div>
        ) : (
          <div className="text-[13px]">
            <div className="font-num text-[22px] font-semibold">{gbp(nextVat.amount)}</div>
            <div className="text-[var(--ink-secondary)]">
              {nextVat.payable ? "to pay" : "to reclaim"} for {niceDate(nextVat.start)} – {niceDate(nextVat.end)}
              {nextVat.open ? " (so far)" : ""}
            </div>
            <div className="mt-1 text-[12px] text-[var(--ink-muted)]">Due {niceDate(nextVat.dueDate)}</div>
          </div>
        )}
      </Widget>
    ),
    bank: () => (
      <Widget title="Bank" link={{ href: "/dashboard/banking", label: "Banking" }}>
        <div className="text-[13px]">
          <div className="font-num text-[22px] font-semibold">{gbp(ins.figures.cash)}</div>
          <div className="text-[var(--ink-secondary)]">in your books today</div>
          {bank && (
            <div className="mt-2 text-[12px] text-[var(--ink-muted)]">
              {bank.statementBalance !== null ? `Statement ${gbp(bank.statementBalance)} on ${niceDate(bank.statementDate!)} · ` : "No statement imported yet · "}
              {bank.unreconciled ? `${bank.unreconciled} line${bank.unreconciled === 1 ? "" : "s"} to reconcile` : "fully reconciled"}
            </div>
          )}
        </div>
      </Widget>
    ),
  };

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Insights</h1>
          <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">Your business at a glance, straight from your books. Arrange it how you like.</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-0.5 text-[12.5px] font-semibold">
            {([1, 3, 12] as const).map((m) => (
              <Link key={m} href={`/dashboard/insights?months=${m}`} className={`rounded-md px-3 py-1.5 ${m === months ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]"}`}>
                {m === 1 ? "Month" : m === 3 ? "Quarter" : "Year"}
              </Link>
            ))}
          </div>
          <DashboardCustomiser current={layout} all={WIDGETS} />
        </div>
      </div>
      {layout.length === 0 ? (
        <div className={`${card} px-[18px] py-6 text-[13px] text-[var(--ink-muted)]`}>Your dashboard is empty — use Customise to add widgets.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {layout.map((w) => (
            <div key={w} className={w === "health" || w === "kpis" ? "lg:col-span-2" : ""}>
              {render[w]()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgedSummary({ data }: { data: Awaited<ReturnType<typeof aged>> | null }) {
  if (!data || data.total === 0) return <div className="text-[13px] text-[var(--ink-muted)]">Nothing outstanding.</div>;
  const labels: Record<string, string> = { current: "Not yet due", "1-30": "1–30 days late", "31-60": "31–60 days late", "61-90": "61–90 days late", "90+": "Over 90 days late" };
  return (
    <div className="text-[13px]">
      <div className="font-num text-[22px] font-semibold">{gbp(data.total)}</div>
      <div className="mt-2 flex flex-col gap-1">
        {AGED_BUCKETS.filter((b) => data.totals[b]).map((b) => (
          <div key={b} className="flex justify-between text-[12.5px]">
            <span className="text-[var(--ink-secondary)]">{labels[b]}</span>
            <span className="font-num font-semibold" style={{ color: b === "current" ? undefined : "var(--critical-ink)" }}>
              {gbp(data.totals[b])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
