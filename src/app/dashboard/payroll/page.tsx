import Link from "next/link";
import { gbp } from "@/lib/format";
import { FREQUENCY_LABELS } from "@/lib/payroll/engine";
import { listPayRuns } from "@/lib/payroll/runs";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; bg: string; ink: string }> = {
  open: { label: "Draft", bg: "var(--warning-soft)", ink: "var(--warning-ink)" },
  approved: { label: "Approved", bg: "var(--good-soft)", ink: "var(--good-ink)" },
  approved_partial: { label: "Approved (partial)", bg: "var(--good-soft)", ink: "var(--good-ink)" },
};

export default async function PayRunsPage() {
  const runs = await listPayRuns();
  const hasOpen = runs.some((r) => r.status === "open");

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Pay runs</h1>
          <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">Every pay run, newest first — open one for payslips and the full breakdown</div>
        </div>
        <div className="flex gap-2">
        <Link
          href="/dashboard/payroll/hmrc"
          className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2 text-[12.5px] font-semibold hover:bg-[var(--surface-2)]"
        >
          HMRC filing
        </Link>
        {!hasOpen && (
          <Link
            href="/dashboard/payroll/new"
            className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
          >
            Run payroll
          </Link>
        )}
        </div>
      </div>

      <section className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        {runs.length === 0 ? (
          <div className="px-[18px] py-6 text-center text-[13px] text-[var(--ink-muted)]">No pay runs yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
                  <th className="px-[18px] py-2.5 font-semibold">Run</th>
                  <th className="px-[18px] py-2.5 font-semibold">Status</th>
                  <th className="px-[18px] py-2.5 text-right font-semibold">People</th>
                  <th className="px-[18px] py-2.5 text-right font-semibold">Gross</th>
                  <th className="px-[18px] py-2.5 text-right font-semibold">Net pay</th>
                  <th className="px-[18px] py-2.5 text-right font-semibold">Cost to company</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const st = STATUS[r.status] ?? { label: r.status, bg: "var(--surface-2)", ink: "var(--ink-muted)" };
                  return (
                    <tr key={r.id} className="border-b border-[var(--border)] last:border-b-0">
                      <td className="px-[18px] py-2.5">
                        {r.source === "engine" ? (
                          <Link href={`/dashboard/payroll/${r.id}`} className="font-semibold hover:text-[var(--accent-strong)]">
                            {r.period_label}
                          </Link>
                        ) : (
                          <span className="font-semibold">{r.period_label}</span>
                        )}
                        <div className="text-[11.5px] text-[var(--ink-muted)]">
                          {r.frequency ? `${FREQUENCY_LABELS[r.frequency]} · ` : ""}
                          {r.pay_period}
                          {r.source !== "engine" && " · sample data"}
                        </div>
                      </td>
                      <td className="px-[18px] py-2.5">
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: st.bg, color: st.ink }}>
                          {st.label}
                        </span>
                      </td>
                      <td className="font-num px-[18px] py-2.5 text-right">{r.line_count}</td>
                      <td className="font-num px-[18px] py-2.5 text-right">{gbp(r.gross_pay)}</td>
                      <td className="font-num px-[18px] py-2.5 text-right">{gbp(r.net_pay)}</td>
                      <td className="font-num px-[18px] py-2.5 text-right">{gbp(r.gross_pay + r.employer_ni + r.employer_pension)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
