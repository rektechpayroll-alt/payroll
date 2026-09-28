import Link from "next/link";
import { BudgetEditor, SuggestBudgetsButton } from "@/components/InsightsHub";
import { StatRow, StatTile } from "@/components/StatTile";
import { gbp } from "@/lib/format";
import { budgetYear, type BudgetRow } from "@/lib/insights/data";

export const dynamic = "force-dynamic";

const card = "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]";
const cols = "grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_60px] items-center gap-2";
const sum = (a: number[]) => Math.round(a.reduce((s, v) => s + v, 0) * 100) / 100;
const shiftYear = (start: string, by: number) => `${Number(start.slice(0, 4)) + by}${start.slice(4)}`;
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

const SECTIONS: Array<{ key: BudgetRow["section"]; label: string }> = [
  { key: "income", label: "Income" },
  { key: "costOfSales", label: "Cost of sales" },
  { key: "expenses", label: "Overheads" },
];

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ start?: string; all?: string }> }) {
  const sp = await searchParams;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const start = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.start ?? "") ? sp.start! : `${thisMonth.slice(0, 4)}-01`;
  const { months, rows } = await budgetYear(start);
  // Months so far this budget year, including the current one.
  const elapsed = months.filter((m) => m <= thisMonth).length;

  const isIncome = (r: BudgetRow) => r.section === "income";
  const toDate = (a: number[]) => sum(a.slice(0, elapsed));
  const profit = (pick: (r: BudgetRow) => number) => sum(rows.map((r) => (isIncome(r) ? pick(r) : -pick(r))));
  const budgetProfitYear = profit((r) => sum(r.budget));
  const budgetProfitToDate = profit((r) => toDate(r.budget));
  const actualProfitToDate = profit((r) => toDate(r.actual));
  const hasBudget = rows.some((r) => r.budget.some((b) => b));
  const currentIdx = months.indexOf(thisMonth);
  const overThisMonth = currentIdx < 0 ? [] : rows.filter((r) => !isIncome(r) && r.budget[currentIdx] > 0 && r.actual[currentIdx] > r.budget[currentIdx]);

  const visible = (r: BudgetRow) => sp.all || r.budget.some((b) => b) || r.actual.some((a) => a) || r.suggestion.amounts.some((a) => a);
  const hiddenCount = rows.filter((r) => !visible(r)).length;
  const qs = (s: string, all = sp.all) => `/dashboard/budget?start=${s}${all ? "&all=1" : ""}`;

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Budget</h1>
          <div className="mt-1 max-w-[720px] text-[13px] text-[var(--ink-secondary)]">
            Monthly budgets for each income and cost account, checked against your books as they happen. Suggestions come from your own history — the same
            month last year and your growth trend once you&rsquo;ve a year of figures.
          </div>
        </div>
        <div className="flex items-center gap-2 text-[12.5px] font-semibold">
          <Link href={qs(shiftYear(start, -1))} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 hover:bg-[var(--surface-2)]">
            ←
          </Link>
          <span>
            {monthName(months[0])} – {monthName(months[11])}
          </span>
          <Link href={qs(shiftYear(start, 1))} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 hover:bg-[var(--surface-2)]">
            →
          </Link>
          <form className="flex items-center gap-1">
            <select name="start" defaultValue={start.slice(5)} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 py-1.5" aria-label="Year starts in">
              {["01", "04", "07", "10"].map((m) => (
                <option key={m} value={`${start.slice(0, 4)}-${m}`}>
                  Year from {new Date(`2000-${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}
                </option>
              ))}
            </select>
            <button className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 hover:bg-[var(--surface-2)]">Go</button>
          </form>
        </div>
      </div>

      <StatRow>
        <StatTile label="Budgeted profit for the year" value={gbp(budgetProfitYear)} meta={<span>{hasBudget ? "income less budgeted costs" : "no budget set yet"}</span>} />
        <StatTile
          label={`Profit so far (${elapsed} month${elapsed === 1 ? "" : "s"})`}
          value={gbp(actualProfitToDate)}
          meta={<span>budget to date {gbp(budgetProfitToDate)}</span>}
          pill={hasBudget && elapsed ? (actualProfitToDate >= budgetProfitToDate ? { tone: "good", icon: <span>✓</span>, text: "Ahead of budget" } : { tone: "warn", icon: <span>⚠</span>, text: "Behind budget" }) : undefined}
        />
        <StatTile
          label="Over budget this month"
          value={String(overThisMonth.length)}
          meta={<span>{overThisMonth.length ? overThisMonth.map((r) => r.name).join(", ") : currentIdx < 0 ? "this month isn't in this budget year" : "every cost is within budget"}</span>}
        />
      </StatRow>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-[18px] py-[13px]">
          <div>
            <h2 className="font-display text-[14.5px] font-semibold">Budget against actual</h2>
            <div className="text-xs text-[var(--ink-muted)]">&ldquo;To date&rdquo; covers the months of this budget year up to and including this month</div>
          </div>
          <SuggestBudgetsButton start={start} />
        </div>
        <div className={`${cols} bg-[var(--surface-2)] px-[18px] py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]`}>
          <span>Account</span>
          <span className="text-right">Budget to date</span>
          <span className="text-right">Actual to date</span>
          <span className="text-right">Difference</span>
          <span className="text-right">Full year</span>
          <span />
        </div>
        {SECTIONS.map((s) => {
          const inSection = rows.filter((r) => r.section === s.key && visible(r));
          if (!inSection.length) return null;
          return (
            <div key={s.key}>
              <div className="border-t border-[var(--border)] px-[18px] pb-1 pt-3 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--ink-secondary)]">{s.label}</div>
              {inSection.map((r) => {
                const b = toDate(r.budget);
                const a = toDate(r.actual);
                const diff = Math.round((s.key === "income" ? a - b : b - a) * 100) / 100;
                return (
                  <div key={r.code} className={`${cols} border-t border-[var(--border)] px-[18px] py-2 text-[12.5px]`}>
                    <span>
                      <span className="font-num text-[var(--ink-muted)]">{r.code}</span> {r.name}
                      {!r.budget.some((x) => x) && r.suggestion.amounts.some((x) => x) && (
                        <span className="block text-[11px] text-[var(--ink-muted)]">
                          Suggested {gbp(sum(r.suggestion.amounts))} a year · {r.suggestion.basis.toLowerCase()}
                        </span>
                      )}
                    </span>
                    <span className="font-num text-right">{b ? gbp(b) : "—"}</span>
                    <span className="font-num text-right">{a ? gbp(a) : "—"}</span>
                    <span className="font-num text-right font-semibold" style={{ color: !b ? undefined : diff >= 0 ? "var(--good-ink)" : "var(--critical-ink)" }}>
                      {b ? `${diff >= 0 ? "+" : "−"}${gbp(Math.abs(diff))}` : "—"}
                    </span>
                    <span className="font-num text-right">{sum(r.budget) ? gbp(sum(r.budget)) : "—"}</span>
                    <span className="text-right">
                      <BudgetEditor start={start} code={r.code} months={months} budget={r.budget} suggestion={r.suggestion.amounts} basis={r.suggestion.basis} />
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
        <div className="border-t border-[var(--border)] px-[18px] py-3 text-[12px] text-[var(--ink-muted)]">
          {hiddenCount > 0 && !sp.all ? (
            <Link href={qs(start, "1")} className="font-semibold text-[var(--accent-strong)]">
              Show {hiddenCount} more account{hiddenCount === 1 ? "" : "s"} with no activity
            </Link>
          ) : sp.all ? (
            <Link href={qs(start, "")} className="font-semibold text-[var(--accent-strong)]">
              Hide accounts with no activity
            </Link>
          ) : null}
        </div>
      </section>

      {hasBudget && (
        <section className={`${card} mt-4 overflow-x-auto`}>
          <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Net profit by month</h2>
          </div>
          <table className="w-full min-w-[760px] text-[12px]">
            <thead>
              <tr className="text-[var(--ink-muted)]">
                <th className="px-[18px] py-2 text-left font-semibold" />
                {months.map((m) => (
                  <th key={m} className="px-1.5 py-2 text-right font-semibold">
                    {new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-num">
              {(["budget", "actual"] as const).map((k) => (
                <tr key={k} className="border-t border-[var(--border)]">
                  <td className="px-[18px] py-2 font-sans font-semibold">{k === "budget" ? "Budget" : "Actual"}</td>
                  {months.map((m, i) => {
                    const v = profit((r) => r[k][i]);
                    const future = k === "actual" && m > thisMonth;
                    return (
                      <td key={m} className="px-1.5 py-2 text-right" style={{ color: future ? "var(--ink-muted)" : v < 0 ? "var(--critical-ink)" : undefined }}>
                        {future ? "—" : Math.round(v).toLocaleString("en-GB")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
