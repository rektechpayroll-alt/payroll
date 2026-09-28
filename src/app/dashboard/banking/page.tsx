import Link from "next/link";
import { AutoReconcileButton, BankRules, OpeningBalanceButton, StatementImport, StatementLineRow } from "@/components/BankingHub";
import { StatRow, StatTile } from "@/components/StatTile";
import { bankSummary, listRules, listStatementLines } from "@/lib/banking/bank";
import { gbp } from "@/lib/format";
import { getChartOfAccounts } from "@/lib/ledger/reports";
import { getCompany } from "@/lib/queries";

export const dynamic = "force-dynamic";

const card = "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]";

export default async function BankingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const view = (await searchParams).view === "all" ? "all" : "unreconciled";
  const [company, summary, lines, rules, accounts] = await Promise.all([getCompany(), bankSummary(), listStatementLines(view), listRules(), getChartOfAccounts()]);
  const postable = accounts.filter((a) => a.code !== "1200").map((a) => ({ code: a.code, name: a.name }));
  const diffOk = summary.difference === 0;

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Banking</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} · import your bank statements and reconcile every line against Verity&rsquo;s books
        </div>
      </div>

      <StatRow>
        <StatTile
          label="Statement balance"
          value={summary.statementBalance === null ? "—" : gbp(summary.statementBalance)}
          meta={<div>{summary.statementDate ? `at ${summary.statementDate}` : "Import a statement with balances"}</div>}
        />
        <StatTile
          label="Bank in the books"
          value={summary.booksBalance === null ? "—" : gbp(summary.booksBalance)}
          meta={<div>{summary.statementDate ? `at ${summary.statementDate}` : "—"}</div>}
        />
        <StatTile
          label="Difference"
          value={summary.difference === null ? "—" : gbp(summary.difference)}
          meta={<div>{summary.difference === null ? "" : diffOk ? "Reconciled — the books match the bank" : `${summary.unreconciled} line${summary.unreconciled === 1 ? "" : "s"} still to reconcile`}</div>}
          pill={
            summary.difference === null
              ? undefined
              : { tone: diffOk ? "good" : "warn", icon: <span />, text: diffOk ? "Balanced" : "Needs attention" }
          }
        />
      </StatRow>

      {!summary.hasOpeningBalance && summary.firstLine && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[10px] bg-[var(--warning-soft)] px-4 py-3 text-[12.5px] text-[var(--warning-ink)]">
          Your books don&rsquo;t have an opening bank balance yet, so they&rsquo;ll never match the statement.
          <OpeningBalanceButton amount={summary.firstLine.balanceBefore} date={summary.firstLine.date} />
        </div>
      )}

      <section className={`${card} mb-4`}>
        <div className="flex flex-wrap items-start justify-between gap-4 px-[18px] py-4">
          <StatementImport />
          <AutoReconcileButton disabled={summary.unreconciled === 0} />
        </div>
      </section>

      <div className="mb-3 flex gap-[7px]">
        {(["unreconciled", "all"] as const).map((v) => (
          <Link
            key={v}
            href={`/dashboard/banking${v === "all" ? "?view=all" : ""}`}
            className={`rounded-full border px-[13px] py-[7px] text-[12.8px] font-semibold ${
              view === v ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"
            }`}
          >
            {v === "unreconciled" ? "To reconcile" : "All statement lines"}
          </Link>
        ))}
      </div>

      <section className={`${card} mb-4`}>
        {lines.length === 0 ? (
          <div className="px-[18px] py-6 text-center text-[13px] text-[var(--ink-muted)]">
            {view === "unreconciled" ? "Nothing to reconcile. Upload your latest statement to keep the books up to date." : "No statement lines yet."}
          </div>
        ) : (
          lines.map((l) => <StatementLineRow key={l.id} line={l} accounts={postable} />)
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={card}>
          <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Bank rules</h2>
            <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Lines that match a rule are posted automatically by Auto-reconcile</div>
          </div>
          <div className="px-[18px] py-3">
            <BankRules rules={rules} accounts={postable} />
          </div>
        </section>
        <section className={card}>
          <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Recorded in Verity, not yet on a statement</h2>
            <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Payments you marked in Verity — they&rsquo;ll be confirmed when the statement line arrives</div>
          </div>
          <div className="px-[18px] py-3 text-[12.5px]">
            {summary.unconfirmed.length === 0 ? (
              <div className="text-[var(--ink-muted)]">None.</div>
            ) : (
              summary.unconfirmed.map((u) => (
                <div key={u.id} className="flex justify-between gap-3 py-1">
                  <span>
                    <span className="font-num text-[var(--ink-muted)]">{u.date}</span> {u.description}
                  </span>
                  <span className="font-num">{gbp(u.amount)}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
