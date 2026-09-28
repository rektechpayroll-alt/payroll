import Link from "next/link";
import { BalanceChart } from "@/components/Charts";
import { ForecastItemForm, RemoveForecastItem } from "@/components/InsightsHub";
import { StatRow, StatTile } from "@/components/StatTile";
import { gbp } from "@/lib/format";
import { cashForecast } from "@/lib/insights/data";
import { FORECAST_HORIZONS, type CashItemKind } from "@/lib/insights/forecast";

export const dynamic = "force-dynamic";

const card = "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]";
const p2 = (pence: number) => gbp(pence / 100);
const niceDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const KIND: Record<CashItemKind, string> = {
  invoice: "Invoice",
  bill: "Bill",
  recurring: "Recurring invoice",
  wages: "Wages",
  hmrc: "HMRC",
  pension: "Pension",
  vat: "VAT",
  regular: "Regular",
  manual: "What-if",
};

export default async function CashflowPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const wanted = Number((await searchParams).days);
  const days = (FORECAST_HORIZONS as readonly number[]).includes(wanted) ? wanted : 90;
  const f = await cashForecast(days);

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Cash flow forecast</h1>
          <div className="mt-1 max-w-[720px] text-[13px] text-[var(--ink-secondary)]">
            Your bank balance day by day, from what customers owe (timed by how they usually pay), bills, recurring invoices, payroll with HMRC and pension
            payments, VAT returns and your regular bank spending.
          </div>
        </div>
        <div className="flex rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-0.5 text-[12.5px] font-semibold">
          {FORECAST_HORIZONS.map((d) => (
            <Link key={d} href={`/dashboard/cashflow?days=${d}`} className={`rounded-md px-3 py-1.5 ${d === days ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]"}`}>
              {d} days
            </Link>
          ))}
        </div>
      </div>

      {f.overdrawnOn && (
        <div className="mb-4 rounded-[10px] bg-[var(--critical-soft)] px-4 py-3 text-[13px] font-semibold text-[var(--critical-ink)]">
          ⚠ Your balance is forecast to go below zero on {niceDate(f.overdrawnOn)} and reach {p2(f.lowest.balance)} on {niceDate(f.lowest.date)}.
        </div>
      )}

      <StatRow>
        <StatTile label="Cash today" value={p2(f.opening)} meta={<span>bank balance in your books</span>} />
        <StatTile
          label="Lowest point"
          value={p2(f.lowest.balance)}
          meta={<span>on {niceDate(f.lowest.date)}</span>}
          pill={f.lowest.balance < 0 ? { tone: "warn", icon: <span>⚠</span>, text: "Goes overdrawn" } : { tone: "good", icon: <span>✓</span>, text: "Stays positive" }}
        />
        <StatTile label={`In ${days} days`} value={p2(f.closing)} meta={<span>+{p2(f.cashIn)} in · −{p2(f.cashOut)} out</span>} />
      </StatRow>

      <section className={`${card} mb-4 px-[18px] py-4`}>
        <BalanceChart points={f.daily.map((d) => ({ date: d.date, value: d.balance / 100 }))} height={220} />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.3fr]">
        <section className={card}>
          <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Week by week</h2>
          </div>
          <div className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-2 bg-[var(--surface-2)] px-[18px] py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            <span>Week from</span>
            <span className="text-right">In</span>
            <span className="text-right">Out</span>
            <span className="text-right">Balance</span>
          </div>
          {f.weeks.map((w) => (
            <div key={w.start} className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-2 border-t border-[var(--border)] px-[18px] py-2 text-[12.5px]">
              <span>{niceDate(w.start)}</span>
              <span className="font-num text-right text-[var(--good-ink)]">{w.cashIn ? p2(w.cashIn) : "—"}</span>
              <span className="font-num text-right text-[var(--critical-ink)]">{w.cashOut ? p2(w.cashOut) : "—"}</span>
              <span className="font-num text-right font-semibold" style={{ color: w.closing < 0 ? "var(--critical-ink)" : undefined }}>
                {p2(w.closing)}
              </span>
            </div>
          ))}
        </section>

        <section className={card}>
          <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">What&rsquo;s coming in and going out</h2>
            <div className="text-xs text-[var(--ink-muted)]">Known items come from real invoices, bills and pay runs; estimated ones are projected from schedules and history.</div>
          </div>
          <div className="border-b border-[var(--border)] px-[18px] py-3">
            <div className="mb-2 text-[12px] font-semibold text-[var(--ink-secondary)]">Plan a what-if — a loan, a big purchase, a new hire</div>
            <ForecastItemForm today={f.today} />
          </div>
          {f.items.length === 0 ? (
            <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">Nothing expected yet — raise invoices, record bills or run payroll and they&rsquo;ll appear here.</div>
          ) : (
            f.items.map((i, n) => (
              <div key={`${i.date}-${n}`} className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-[18px] py-2 text-[12.5px] last:border-b-0">
                <div className="min-w-0">
                  <span className="font-num text-[var(--ink-muted)]">{niceDate(i.date)}</span> · {i.label}{" "}
                  <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${i.certainty === "known" ? "bg-[var(--good-soft)] text-[var(--good-ink)]" : "bg-[var(--surface-2)] text-[var(--ink-secondary)]"}`}>
                    {KIND[i.kind]}
                    {i.certainty === "estimated" ? " · estimate" : ""}
                  </span>
                  {i.id && <RemoveForecastItem id={i.id} />}
                </div>
                <span className="font-num shrink-0 font-semibold" style={{ color: i.amount > 0 ? "var(--good-ink)" : undefined }}>
                  {i.amount > 0 ? "+" : "−"}
                  {p2(Math.abs(i.amount))}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
