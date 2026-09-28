import { gbp } from "@/lib/format";
import type { Journal, TrialBalanceRow } from "@/lib/queries";

const SOURCE_LABELS: Record<string, string> = {
  payroll_run: "Payroll",
};

function money(n: number) {
  return n ? gbp(n) : "";
}

export function JournalsPanel({ journals, trialBalance }: { journals: Journal[]; trialBalance: TrialBalanceRow[] }) {
  const tbDebit = trialBalance.reduce((s, r) => s + r.debit, 0);
  const tbCredit = trialBalance.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(tbDebit - tbCredit) < 0.005;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-[18px] py-[15px]">
          <div>
            <h2 className="font-display text-[16.5px] font-semibold">Trial balance</h2>
            <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Every account with activity, from all posted journals</div>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: balanced ? "var(--good-soft)" : "var(--critical-soft)",
              color: balanced ? "var(--good-ink)" : "var(--critical-ink)",
            }}
          >
            {balanced ? "Balanced" : "Out of balance"}
          </span>
        </div>
        {trialBalance.length === 0 ? (
          <div className="px-[18px] py-[14px] text-[13px] text-[var(--ink-muted)]">Nothing posted yet — approve a payroll run to post its journal.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
                  <th className="px-[18px] py-2 font-semibold">Account</th>
                  <th className="px-[18px] py-2 text-right font-semibold">Debit</th>
                  <th className="px-[18px] py-2 text-right font-semibold">Credit</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.map((r) => (
                  <tr key={r.code} className="border-b border-[var(--border)]">
                    <td className="px-[18px] py-2">
                      <span className="font-num text-[var(--ink-muted)]">{r.code}</span> {r.name}
                    </td>
                    <td className="font-num px-[18px] py-2 text-right">{money(r.debit)}</td>
                    <td className="font-num px-[18px] py-2 text-right">{money(r.credit)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-[18px] py-2.5">Total</td>
                  <td className="font-num px-[18px] py-2.5 text-right">{gbp(tbDebit)}</td>
                  <td className="font-num px-[18px] py-2.5 text-right">{gbp(tbCredit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="border-b border-[var(--border)] px-[18px] py-[15px]">
          <h2 className="font-display text-[16.5px] font-semibold">Journals</h2>
          <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Posted automatically — approving a payroll run books its full cost here</div>
        </div>
        {journals.length === 0 && (
          <div className="px-[18px] py-[14px] text-[13px] text-[var(--ink-muted)]">No journals yet.</div>
        )}
        {journals.map((j, i) => (
          <div key={j.id} className={i === journals.length - 1 ? "" : "border-b border-[var(--border)]"}>
            <div className="flex flex-wrap items-center gap-2 px-[18px] pb-1 pt-[13px]">
              <span className="text-[13.5px] font-semibold">{j.narration}</span>
              <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-[7px] py-0.5 text-[10.5px] font-semibold text-[var(--ink-secondary)]">
                {SOURCE_LABELS[j.source_type] ?? j.source_type}
              </span>
              <span className="font-num text-[12px] text-[var(--ink-muted)]">{j.journal_date}</span>
            </div>
            <div className="overflow-x-auto px-[18px] pb-[13px]">
              <table className="w-full min-w-[480px] text-[12.5px]">
                <tbody>
                  {j.lines.map((l, k) => (
                    <tr key={k}>
                      <td className={`py-1 ${l.credit ? "pl-6" : ""}`}>
                        <span className="font-num text-[var(--ink-muted)]">{l.account_code}</span> {l.account_name}
                        <div className="text-[11px] text-[var(--ink-muted)]">{l.description}</div>
                      </td>
                      <td className="font-num w-[120px] py-1 text-right align-top">{money(l.debit)}</td>
                      <td className="font-num w-[120px] py-1 text-right align-top">{money(l.credit)}</td>
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
