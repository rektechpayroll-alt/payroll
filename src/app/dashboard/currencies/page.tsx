import { RefreshRatesButton, RevalueForm } from "@/components/FxTools";
import { StatRow, StatTile } from "@/components/StatTile";
import { CURRENCIES } from "@/lib/fx/currencies";
import { latestRates } from "@/lib/fx/rates";
import { fxSummary, openForeignBalances } from "@/lib/fx/revalue";
import { gbp } from "@/lib/format";

export const dynamic = "force-dynamic";

const card = "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]";
const nameOf = (code: string) => CURRENCIES.find((c) => c.code === code)?.name ?? code;

export default async function CurrenciesPage() {
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const [rates, open, summary] = await Promise.all([latestRates(), openForeignBalances(today).catch(() => []), fxSummary(yearStart)]);
  const unrealised = Math.round(open.reduce((s, o) => s + o.difference, 0) * 100) / 100;
  const realisedNet = Math.round((summary.realisedGains - summary.realisedLosses) * 100) / 100;
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${gbp(Math.abs(n))}`;

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Currencies</h1>
        <div className="mt-1 max-w-[760px] text-[13px] text-[var(--ink-secondary)]">
          Invoice and pay in {CURRENCIES.length - 1} currencies. Each invoice and bill is converted at the European Central Bank reference rate on its date; when it&rsquo;s paid, the
          difference between that and the pounds that actually moved is booked as an exchange gain or loss.
        </div>
      </div>

      <StatRow>
        <StatTile label={`Realised this year`} value={signed(realisedNet)} meta={<span>gains {gbp(summary.realisedGains)} · losses {gbp(summary.realisedLosses)}</span>} />
        <StatTile label="Unrealised today" value={signed(unrealised)} meta={<span>on {open.length} open foreign invoice{open.length === 1 ? "" : "s"} and bill{open.length === 1 ? "" : "s"}</span>} />
        <StatTile label="Rates as of" value={rates[0]?.date ?? "—"} meta={<span>ECB reference rates, updated every working day</span>} />
      </StatRow>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-[18px] py-[13px]">
            <div>
              <h2 className="font-display text-[14.5px] font-semibold">Open foreign balances</h2>
              <div className="text-xs text-[var(--ink-muted)]">Valued at today&rsquo;s rate against what they were booked at</div>
            </div>
            <RevalueForm today={today} />
          </div>
          {open.length === 0 ? (
            <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">No open invoices or bills in other currencies.</div>
          ) : (
            open.map((o) => (
              <div key={o.id} className="grid grid-cols-[1.6fr_1fr_1fr_1fr] items-center gap-2 border-t border-[var(--border)] px-[18px] py-2 text-[12.5px] first:border-t-0">
                <span>
                  <strong>{o.reference}</strong> {o.party}
                  <span className="block text-[11px] text-[var(--ink-muted)]">{o.kind === "invoice" ? "Owed to you" : "You owe"}</span>
                </span>
                <span className="font-num text-right">
                  {o.currency} {o.original.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                </span>
                <span className="font-num text-right">
                  {gbp(o.booked)} → {gbp(o.current)}
                </span>
                <span className="font-num text-right font-semibold" style={{ color: o.difference > 0 ? "var(--good-ink)" : o.difference < 0 ? "var(--critical-ink)" : undefined }}>
                  {signed(o.difference)}
                </span>
              </div>
            ))
          )}
          {summary.revaluations.length > 0 && (
            <div className="border-t border-[var(--border)] px-[18px] py-3 text-[12px] text-[var(--ink-secondary)]">
              Revaluations posted (each reversed the next day):{" "}
              {summary.revaluations.map((r) => `${r.date} ${signed(r.net)}`).join(" · ")}
            </div>
          )}
        </section>

        <section className={card}>
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Today&rsquo;s rates</h2>
            <RefreshRatesButton />
          </div>
          {rates.length === 0 ? (
            <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">No rates yet — fetch them now.</div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              {rates.map((r) => (
                <div key={r.currency} className="flex items-center justify-between border-t border-[var(--border)] px-[18px] py-1.5 text-[12.5px] first:border-t-0">
                  <span>
                    <strong className="font-num">{r.currency}</strong> <span className="text-[var(--ink-secondary)]">{nameOf(r.currency)}</span>
                  </span>
                  <span className="font-num" title={r.source}>
                    £{r.rate.toFixed(4)} <span className="text-[var(--ink-muted)]">· £1 = {(1 / r.rate).toFixed(4)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
