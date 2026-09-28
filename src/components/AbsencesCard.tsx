"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Absence } from "@/lib/payroll/records";
import { ABSENCE_TYPES, type AbsenceType } from "@/lib/payroll/statutory";

export function AbsencesCard({ employeeId, absences }: { employeeId: string; absences: Absence[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ type: "sickness" as AbsenceType, startDate: "", endDate: "", averageWeeklyEarnings: "", deductPay: true, notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]";
  const label = "flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]";
  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] lg:col-span-2">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-[18px] py-[15px] pb-[13px]">
        <div>
          <h2 className="font-display text-[14.5px] font-semibold">Absence &amp; statutory pay</h2>
          <div className="text-[11.5px] text-[var(--ink-muted)]">Sickness and family leave — SSP, SMP, SPP and the rest are calculated on each pay run</div>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-[11.5px] font-semibold hover:bg-[var(--surface-2)]">
            Record absence
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-b border-[var(--border)] px-[18px] py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className={label}>
              Type
              <select className={input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as AbsenceType })}>
                {(Object.keys(ABSENCE_TYPES) as AbsenceType[]).map((t) => (
                  <option key={t} value={t}>
                    {ABSENCE_TYPES[t].label} ({ABSENCE_TYPES[t].payment})
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              First day
              <input type="date" className={`${input} font-num`} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
            </label>
            <label className={label}>
              Last day
              <input type="date" className={`${input} font-num`} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
            </label>
            <label className={label}>
              Average weekly earnings (£)
              <input className={`${input} font-num`} inputMode="decimal" placeholder="Estimate from salary" value={f.averageWeeklyEarnings} onChange={(e) => setF({ ...f, averageWeeklyEarnings: e.target.value })} />
            </label>
          </div>
          <label className="flex items-start gap-2 text-[12.5px]">
            <input type="checkbox" className="mt-0.5" checked={f.deductPay} onChange={(e) => setF({ ...f, deductPay: e.target.checked })} />
            <span>
              Stop normal pay for these days <span className="text-[var(--ink-muted)]">— untick if you pay full company sick or family pay on top</span>
            </span>
          </label>
          {error && <div className="text-[12.5px] text-[var(--critical-ink)]">{error}</div>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => post("/api/employees/absences/create", { employeeId, ...f })} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
              {busy ? "Saving…" : "Save absence"}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]">
              Cancel
            </button>
          </div>
        </div>
      )}
      {absences.length === 0 ? (
        <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">No absences recorded.</div>
      ) : (
        <div>
          {absences.map((a, i) => (
            <div key={a.id} className={`flex flex-wrap items-center justify-between gap-3 px-[18px] py-3 text-[13px] ${i ? "border-t border-[var(--border)]" : ""}`}>
              <div>
                <span className="font-semibold">{ABSENCE_TYPES[a.type].label}</span>{" "}
                <span className="text-[var(--ink-muted)]">({ABSENCE_TYPES[a.type].payment})</span>
                <div className="font-num text-[12px] text-[var(--ink-secondary)]">
                  {a.start_date} → {a.end_date}
                  {a.average_weekly_earnings != null && ` · AWE £${a.average_weekly_earnings.toFixed(2)}`}
                  {!a.deduct_pay && " · full pay continues"}
                </div>
              </div>
              <button disabled={busy} onClick={() => post("/api/employees/absences/delete", { id: a.id })} className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)] disabled:opacity-50">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
