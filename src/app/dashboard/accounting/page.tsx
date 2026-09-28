import Link from "next/link";
import { ManualJournalForm } from "@/components/ManualJournalForm";
import { ReverseJournalButton } from "@/components/ReverseJournalButton";
import { gbp } from "@/lib/format";
import { AGED_BUCKETS, aged, balanceSheet, getChartOfAccounts, profitAndLoss, type AccountBalance } from "@/lib/ledger/reports";
import { getCompany, getJournals } from "@/lib/queries";

export const dynamic = "force-dynamic";

const TABS = [
  ["pl", "Profit & loss"],
  ["bs", "Balance sheet"],
  ["debtors", "Aged debtors"],
  ["creditors", "Aged creditors"],
  ["accounts", "Chart of accounts"],
  ["journals", "Journals"],
] as const;
type Tab = (typeof TABS)[number][0];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Common reporting periods, relative to today. UK tax year starts 6 April. */
function periods(today: Date) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const taxStartYear = today >= new Date(Date.UTC(y, 3, 6)) ? y : y - 1;
  return {
    "this-month": { label: "This month", from: iso(new Date(Date.UTC(y, m, 1))), to: iso(today) },
    "last-month": { label: "Last month", from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) },
    "tax-year": { label: "This tax year", from: `${taxStartYear}-04-06`, to: iso(today) },
    "calendar-year": { label: "Year to date", from: `${y}-01-01`, to: iso(today) },
  } as const;
}

function Section({ title, rows, total, totalLabel }: { title: string; rows: AccountBalance[]; total: number; totalLabel: string }) {
  return (
    <>
      <tr>
        <td colSpan={2} className="px-[18px] pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          {title}
        </td>
      </tr>
      {rows.length === 0 && (
        <tr>
          <td className="px-[18px] py-1.5 text-[var(--ink-muted)]" colSpan={2}>
            Nothing in this period
          </td>
        </tr>
      )}
      {rows.map((a) => (
        <tr key={a.code}>
          <td className="px-[18px] py-1.5">
            <span className="font-num text-[var(--ink-muted)]">{a.code}</span> {a.name}
          </td>
          <td className="font-num px-[18px] py-1.5 text-right">{gbp(a.balance)}</td>
        </tr>
      ))}
      <tr className="font-semibold">
        <td className="border-t border-[var(--border)] px-[18px] py-2">{totalLabel}</td>
        <td className="font-num border-t border-[var(--border)] px-[18px] py-2 text-right">{gbp(total)}</td>
      </tr>
    </>
  );
}

const card = "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]";

export default async function AccountingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "pl") as Tab;
  const company = await getCompany();
  const today = new Date();
  const presets = periods(today);
  const presetKey = (typeof sp.period === "string" && sp.period in presets ? sp.period : "tax-year") as keyof typeof presets;
  const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : presets[presetKey].from;
  const to = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : presets[presetKey].to;
  const asAt = typeof sp.asAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.asAt) ? sp.asAt : iso(today);

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Accounting</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} · every invoice, bill, claim, asset and pay run posts here automatically, as double-entry journals
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-[7px]">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/dashboard/accounting?tab=${k}`}
            className={`rounded-full border px-[13px] py-[7px] text-[12.8px] font-semibold ${
              tab === k ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "pl" && <ProfitAndLossView from={from} to={to} presets={presets} active={sp.from ? null : presetKey} />}
      {tab === "bs" && <BalanceSheetView asAt={asAt} />}
      {(tab === "debtors" || tab === "creditors") && <AgedView kind={tab === "debtors" ? "receivables" : "payables"} asAt={asAt} />}
      {tab === "accounts" && <ChartView />}
      {tab === "journals" && <JournalsView />}
    </div>
  );
}

async function ProfitAndLossView({ from, to, presets, active }: { from: string; to: string; presets: ReturnType<typeof periods>; active: string | null }) {
  const pl = await profitAndLoss(from, to);
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-[18px] py-[13px]">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(presets).map(([k, p]) => (
            <Link
              key={k}
              href={`/dashboard/accounting?tab=pl&period=${k}`}
              className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold ${active === k ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]"}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-1.5 text-[12px]" action="/dashboard/accounting">
          <input type="hidden" name="tab" value="pl" />
          <input type="date" name="from" defaultValue={from} className="font-num rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 py-1" />
          to
          <input type="date" name="to" defaultValue={to} className="font-num rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 py-1" />
          <button className="rounded-md border border-[var(--border-strong)] px-2 py-1 font-semibold hover:bg-[var(--surface-2)]">Go</button>
        </form>
      </div>
      <table className="w-full text-[13px]">
        <tbody>
          <Section title="Income" rows={pl.income} total={pl.totalIncome} totalLabel="Total income" />
          {pl.costOfSales.length > 0 && <Section title="Cost of sales" rows={pl.costOfSales} total={pl.totalIncome - pl.grossProfit} totalLabel="Total cost of sales" />}
          <tr className="font-semibold">
            <td className="px-[18px] py-2">Gross profit</td>
            <td className="font-num px-[18px] py-2 text-right">{gbp(pl.grossProfit)}</td>
          </tr>
          <Section title="Overheads" rows={pl.expenses} total={pl.totalExpenses} totalLabel="Total overheads" />
          <tr className="text-[14px] font-semibold">
            <td className="border-t-2 border-[var(--border-strong)] px-[18px] py-3">Net profit</td>
            <td className="font-num border-t-2 border-[var(--border-strong)] px-[18px] py-3 text-right" style={{ color: pl.netProfit < 0 ? "var(--critical-ink)" : "var(--good-ink)" }}>
              {gbp(pl.netProfit)}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="border-t border-[var(--border)] px-[18px] py-2 text-[11.5px] text-[var(--ink-muted)]">
        {from} to {to} · accruals basis: sales when invoiced, costs when billed or approved
      </div>
    </section>
  );
}

async function BalanceSheetView({ asAt }: { asAt: string }) {
  const bs = await balanceSheet(asAt);
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-[18px] py-[13px]">
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: bs.balanced ? "var(--good-soft)" : "var(--critical-soft)", color: bs.balanced ? "var(--good-ink)" : "var(--critical-ink)" }}
        >
          {bs.balanced ? "Balances" : "Doesn't balance"}
        </span>
        <form className="flex items-center gap-1.5 text-[12px]" action="/dashboard/accounting">
          <input type="hidden" name="tab" value="bs" />
          As at
          <input type="date" name="asAt" defaultValue={asAt} className="font-num rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 py-1" />
          <button className="rounded-md border border-[var(--border-strong)] px-2 py-1 font-semibold hover:bg-[var(--surface-2)]">Go</button>
        </form>
      </div>
      <table className="w-full text-[13px]">
        <tbody>
          <Section title="Assets" rows={bs.assets} total={bs.totalAssets} totalLabel="Total assets" />
          <Section title="Liabilities" rows={bs.liabilities} total={bs.totalLiabilities} totalLabel="Total liabilities" />
          <tr className="font-semibold">
            <td className="px-[18px] py-2">Net assets</td>
            <td className="font-num px-[18px] py-2 text-right">{gbp(bs.totalAssets - bs.totalLiabilities)}</td>
          </tr>
          <Section
            title="Equity"
            rows={[...bs.equity, { code: "", name: "Profit to date (not yet closed to retained earnings)", type: "equity", debit: 0, credit: 0, balance: bs.profitToDate }]}
            total={bs.totalEquity}
            totalLabel="Total equity"
          />
        </tbody>
      </table>
    </section>
  );
}

async function AgedView({ kind, asAt }: { kind: "receivables" | "payables"; asAt: string }) {
  const r = await aged(kind, asAt);
  return (
    <section className={card}>
      <div className="grid grid-cols-2 gap-3 border-b border-[var(--border)] px-[18px] py-[13px] text-[12.5px] sm:grid-cols-6">
        {AGED_BUCKETS.map((b) => (
          <div key={b}>
            <div className="text-[var(--ink-muted)]">{b === "current" ? "Not yet due" : `${b} days`}</div>
            <div className="font-num font-semibold" style={{ color: b !== "current" && r.totals[b] ? "var(--critical-ink)" : undefined }}>
              {gbp(r.totals[b])}
            </div>
          </div>
        ))}
        <div>
          <div className="text-[var(--ink-muted)]">Total</div>
          <div className="font-num font-semibold">{gbp(r.total)}</div>
        </div>
      </div>
      {r.rows.length === 0 ? (
        <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">Nothing outstanding.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-[18px] py-2 font-semibold">{kind === "receivables" ? "Customer" : "Supplier"}</th>
                <th className="px-[18px] py-2 font-semibold">Reference</th>
                <th className="px-[18px] py-2 font-semibold">Due</th>
                <th className="px-[18px] py-2 text-right font-semibold">Overdue</th>
                <th className="px-[18px] py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-[18px] py-2 font-semibold">{x.name}</td>
                  <td className="font-num px-[18px] py-2">{x.reference}</td>
                  <td className="font-num px-[18px] py-2">{x.dueDate}</td>
                  <td className="font-num px-[18px] py-2 text-right" style={{ color: x.daysOverdue > 0 ? "var(--critical-ink)" : undefined }}>
                    {x.daysOverdue > 0 ? `${x.daysOverdue} days` : "—"}
                  </td>
                  <td className="font-num px-[18px] py-2 text-right">{gbp(x.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

async function ChartView() {
  const accounts = await getChartOfAccounts();
  const groups = ["asset", "liability", "equity", "income", "expense"] as const;
  return (
    <section className={card}>
      <table className="w-full text-[13px]">
        <tbody>
          {groups.map((g) => (
            <Section
              key={g}
              title={{ asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" }[g]}
              rows={accounts.filter((a) => a.type === g)}
              total={accounts.filter((a) => a.type === g).reduce((s, a) => s + a.balance, 0)}
              totalLabel="Total"
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

async function JournalsView() {
  const [journals, accounts] = await Promise.all([getJournals(), getChartOfAccounts()]);
  return (
    <div className="flex flex-col gap-4">
      <ManualJournalForm accounts={accounts.map((a) => ({ code: a.code, name: a.name }))} />
      <section className={card}>
        {journals.length === 0 && <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">No journals yet.</div>}
        {journals.map((j, i) => (
          <div key={j.id} className={i === journals.length - 1 ? "" : "border-b border-[var(--border)]"}>
            <div className="flex flex-wrap items-center gap-2 px-[18px] pb-1 pt-[12px]">
              <span className={`text-[13.5px] font-semibold ${j.reversed_by ? "text-[var(--ink-muted)] line-through" : ""}`}>{j.narration}</span>
              <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-[7px] py-0.5 text-[10.5px] font-semibold text-[var(--ink-secondary)]">
                {j.reverses ? "Reversal" : j.source_type.replace(/_/g, " ")}
              </span>
              <span className="font-num text-[12px] text-[var(--ink-muted)]">{j.journal_date}</span>
              {j.source_type === "manual" && !j.reversed_by && !j.reverses && (
                <span className="ml-auto">
                  <ReverseJournalButton journalId={j.id} />
                </span>
              )}
            </div>
            <div className="overflow-x-auto px-[18px] pb-[12px]">
              <table className="w-full min-w-[480px] text-[12.5px]">
                <tbody>
                  {j.lines.map((l, k) => (
                    <tr key={k}>
                      <td className={`py-0.5 ${l.credit ? "pl-6" : ""}`}>
                        <span className="font-num text-[var(--ink-muted)]">{l.account_code}</span> {l.account_name}
                      </td>
                      <td className="font-num w-[120px] py-0.5 text-right">{l.debit ? gbp(l.debit) : ""}</td>
                      <td className="font-num w-[120px] py-0.5 text-right">{l.credit ? gbp(l.credit) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
