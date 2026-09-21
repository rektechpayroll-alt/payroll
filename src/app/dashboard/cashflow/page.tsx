import { getCompany, getInvoices, getBills, getCurrentRun } from "@/lib/queries";
import { forecastCashFlow } from "@/lib/cashflow";
import { gbp } from "@/lib/format";
import { StatRow, StatTile } from "@/components/StatTile";

export const dynamic = "force-dynamic";

export default async function CashflowPage() {
  const company = await getCompany();
  const [invoices, bills, currentRun] = await Promise.all([getInvoices(), getBills(), getCurrentRun()]);
  const startingBalance = currentRun?.connected_balance ?? 0;
  const forecast = forecastCashFlow(invoices, bills, currentRun ?? null, startingBalance);

  const lowestBalance = Math.min(startingBalance, ...forecast.buckets.map((b) => b.runningBalance));

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Cash flow forecast</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} &middot; an AR/AP aging projection built from real outstanding invoices and bills, plus the
          current payroll run&rsquo;s own cost if its payday falls in range &mdash; the same ledger data that already
          powers the &ldquo;What if?&rdquo; Simulator, pointed forward instead of at a hypothetical.
        </div>
      </div>

      <StatRow>
        <StatTile label="Starting balance" value={gbp(forecast.startingBalance)} meta={<span>connected account, today</span>} />
        <StatTile label="Projected ending balance" value={gbp(forecast.endingBalance)} meta={<span>after all currently-known invoices, bills and payroll</span>} />
        <StatTile
          label="Lowest projected balance"
          value={gbp(lowestBalance)}
          meta={<span>across the forecast window</span>}
          pill={
            lowestBalance < 0
              ? { tone: "warn", icon: <span>&#9888;</span>, text: "Risk of a shortfall" }
              : { tone: "good", icon: <span>&#10003;</span>, text: "Stays positive" }
          }
        />
      </StatRow>

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="border-b border-[var(--border)] px-[18px] py-[15px]">
          <h2 className="font-display text-[16.5px] font-semibold">Aging buckets</h2>
          <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Cash in from open (sent) invoices, cash out from unpaid bills and the current payroll run</div>
        </div>
        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr] gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-[18px] py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          <span>Period</span>
          <span className="text-right">Cash in</span>
          <span className="text-right">Cash out</span>
          <span className="text-right">Net</span>
          <span className="text-right">Balance</span>
        </div>
        {forecast.buckets.map((b, i) => (
          <div
            key={b.label}
            className={`grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr] gap-2 px-[18px] py-[12px] text-[13px] ${i === forecast.buckets.length - 1 ? "" : "border-b border-[var(--border)]"}`}
          >
            <span className="font-semibold">{b.label}</span>
            <span className="font-num text-right text-[var(--good-ink)]">{b.cashIn > 0 ? `+${gbp(b.cashIn)}` : "—"}</span>
            <span className="font-num text-right text-[var(--critical-ink)]">{b.cashOut > 0 ? `−${gbp(b.cashOut)}` : "—"}</span>
            <span className="font-num text-right font-semibold" style={{ color: b.net >= 0 ? "var(--good-ink)" : "var(--critical-ink)" }}>
              {b.net >= 0 ? "+" : "−"}{gbp(Math.abs(b.net))}
            </span>
            <span className="font-num text-right font-bold" style={{ color: b.runningBalance < 0 ? "var(--critical-ink)" : "var(--ink)" }}>
              {gbp(b.runningBalance)}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
