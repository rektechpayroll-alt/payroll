"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import type { PayslipLine } from "@/lib/payroll/runs";

const SEV_INK: Record<string, string> = {
  critical: "var(--critical-ink)",
  serious: "var(--serious-ink)",
  warning: "var(--warning-ink)",
};

function LineEditor({ line, onSaved }: { line: PayslipLine; onSaved: () => void }) {
  const [additions, setAdditions] = useState(String(line.additions || ""));
  const [hours, setHours] = useState(line.hours_worked != null ? String(line.hours_worked) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hourly = line.pay_basis === "hourly";

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/lines/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId: line.id, additions: Number(additions) || 0, hoursWorked: hourly ? hours : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const input = "font-num w-[92px] rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-right text-[12.5px]";
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-secondary)]">
      {hourly && (
        <label className="flex items-center gap-1.5">
          Hours
          <input className={input} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
      )}
      <label className="flex items-center gap-1.5">
        Bonus / additions £
        <input className={input} inputMode="decimal" value={additions} onChange={(e) => setAdditions(e.target.value)} placeholder="0.00" />
      </label>
      <button
        onClick={save}
        disabled={saving}
        className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1 font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)] disabled:opacity-50"
      >
        {saving ? "Recalculating…" : "Save & recalculate"}
      </button>
      {error && <span className="text-[var(--critical-ink)]">{error}</span>}
    </div>
  );
}

export function PayRunTable({ runId, lines, editable }: { runId: string; lines: PayslipLine[]; editable: boolean }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);

  const totals = lines.reduce(
    (t, l) => ({
      gross: t.gross + (l.gross_pay ?? 0),
      tax: t.tax + (l.income_tax ?? 0),
      ni: t.ni + (l.employee_ni ?? 0),
      pension: t.pension + (l.employee_pension ?? 0),
      loans: t.loans + (l.student_loan ?? 0) + (l.postgrad_loan ?? 0),
      net: t.net + l.net_pay,
      erNi: t.erNi + (l.employer_ni ?? 0),
      erPension: t.erPension + (l.employer_pension ?? 0),
    }),
    { gross: 0, tax: 0, ni: 0, pension: 0, loans: 0, net: 0, erNi: 0, erPension: 0 }
  );

  const th = "px-3 py-2.5 text-right font-semibold first:pl-[18px] first:text-left last:pr-[18px]";
  const td = "font-num px-3 py-2.5 text-right";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-[13px]">
        <thead>
          <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
            <th className={th}>Employee</th>
            <th className={th}>Gross</th>
            <th className={th}>Tax</th>
            <th className={th}>NI</th>
            <th className={th}>Pension</th>
            <th className={th}>Loans</th>
            <th className={th}>Net pay</th>
            <th className={th}>Employer NI</th>
            <th className={th}>Employer pension</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-[var(--border)] align-top">
              <td className="py-2.5 pl-[18px] pr-3">
                <Link href={`/dashboard/payroll/${runId}/payslip/${l.id}`} className="font-semibold hover:text-[var(--accent-strong)]">
                  {l.employee_name}
                </Link>
                <div className="text-[11.5px] text-[var(--ink-muted)]">
                  {l.tax_code_used} · NI {l.ni_category_used}
                  {l.tax_basis === "non-cumulative" && " · Wk1/Mth1"}
                  {l.hours_worked != null && ` · ${l.hours_worked}h`}
                  {l.additions > 0 && ` · +${gbp(l.additions)} additions`}
                </div>
                {(l.flags ?? []).map((f, i) => (
                  <div key={i} className="mt-1 max-w-[46ch] text-[11.5px] leading-snug" style={{ color: SEV_INK[f.severity] }}>
                    <span className="font-semibold">{f.tag}:</span> {f.reason}
                  </div>
                ))}
                {editable &&
                  (editingId === l.id ? (
                    <div className="mt-2">
                      <LineEditor
                        line={l}
                        onSaved={() => {
                          setEditingId(null);
                          router.refresh();
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingId(l.id)}
                      className="mt-1 text-[11.5px] font-semibold text-[var(--accent-strong)] hover:underline"
                    >
                      Adjust pay
                    </button>
                  ))}
              </td>
              <td className={td}>{gbp(l.gross_pay ?? 0)}</td>
              <td className={td}>{gbp(l.income_tax ?? 0)}</td>
              <td className={td}>{gbp(l.employee_ni ?? 0)}</td>
              <td className={td}>{gbp(l.employee_pension ?? 0)}</td>
              <td className={td}>{gbp((l.student_loan ?? 0) + (l.postgrad_loan ?? 0))}</td>
              <td className={`${td} font-semibold`}>{gbp(l.net_pay)}</td>
              <td className={td}>{gbp(l.employer_ni ?? 0)}</td>
              <td className={`${td} pr-[18px]`}>{gbp(l.employer_pension ?? 0)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2.5 pl-[18px] pr-3">Total</td>
            <td className={td}>{gbp(totals.gross)}</td>
            <td className={td}>{gbp(totals.tax)}</td>
            <td className={td}>{gbp(totals.ni)}</td>
            <td className={td}>{gbp(totals.pension)}</td>
            <td className={td}>{gbp(totals.loans)}</td>
            <td className={td}>{gbp(totals.net)}</td>
            <td className={td}>{gbp(totals.erNi)}</td>
            <td className={`${td} pr-[18px]`}>{gbp(totals.erPension)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
