"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import { FREQUENCY_LABELS, NI_CATEGORIES, type NiCategory, type PayFrequency } from "@/lib/payroll/engine";
import type { Employee } from "@/lib/queries";

const PLANS: Record<string, string> = { "": "None", "1": "Plan 1", "2": "Plan 2", "4": "Plan 4 (Scotland)", "5": "Plan 5" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11.5px] font-semibold text-[var(--ink-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--ink-muted)]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function PayDetailsCard({ initialEmployee }: { initialEmployee: Employee }) {
  const router = useRouter();
  const [e, setE] = useState(initialEmployee);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => toForm(initialEmployee));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ReturnType<typeof toForm>>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/employees/pay-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      setE(data.employee);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]";
  const missingPay = e.pay_basis === "salary" ? !e.annual_salary : !e.hourly_rate;

  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] lg:col-span-2">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-[18px] py-[15px] pb-[13px]">
        <div>
          <h2 className="font-display text-[14.5px] font-semibold">Pay details</h2>
          {missingPay && <div className="text-[11.5px] text-[var(--critical-ink)]">Add pay before this employee can be paid.</div>}
        </div>
        {!editing && (
          <button
            onClick={() => {
              setForm(toForm(e));
              setEditing(true);
            }}
            className="rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-[11.5px] font-semibold hover:bg-[var(--surface-2)]"
          >
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 px-[18px] py-4 text-[13px] md:grid-cols-2">
          <Detail
            label="Pay"
            value={
              e.pay_basis === "hourly"
                ? e.hourly_rate
                  ? `${gbp(e.hourly_rate)} / hour`
                  : "Not set"
                : e.annual_salary
                  ? `${gbp(e.annual_salary)} / year`
                  : "Not set"
            }
          />
          <Detail label="Paid" value={FREQUENCY_LABELS[e.pay_frequency]} />
          <Detail label="NI category" value={NI_CATEGORIES[e.ni_category]} />
          <Detail label="Student loan" value={`${PLANS[e.student_loan_plan ?? ""]}${e.postgrad_loan ? " + postgraduate" : ""}`} />
          <Detail
            label="Workplace pension"
            value={e.pension_enrolled ? `${e.pension_employee_pct}% employee · ${e.pension_employer_pct}% employer` : "Not enrolled / opted out"}
          />
          <Detail label="Date of birth" value={e.date_of_birth ?? "Not set"} />
          {(e.previous_pay > 0 || e.previous_tax > 0) && (
            <Detail label="P45 (this tax year)" value={`${gbp(e.previous_pay)} pay · ${gbp(e.previous_tax)} tax`} />
          )}
          {e.is_director && <Detail label="Director" value="Yes" />}
          {e.leaving_date && <Detail label="Leaving date" value={e.leaving_date} />}
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-[18px] py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Paid by">
              <select className={input} value={form.payBasis} onChange={(ev) => set({ payBasis: ev.target.value as "salary" | "hourly" })}>
                <option value="salary">Annual salary</option>
                <option value="hourly">Hourly rate</option>
              </select>
            </Field>
            {form.payBasis === "salary" ? (
              <Field label="Annual salary (£)">
                <input className={`${input} font-num`} inputMode="decimal" value={form.annualSalary} onChange={(ev) => set({ annualSalary: ev.target.value })} />
              </Field>
            ) : (
              <Field label="Hourly rate (£)">
                <input className={`${input} font-num`} inputMode="decimal" value={form.hourlyRate} onChange={(ev) => set({ hourlyRate: ev.target.value })} />
              </Field>
            )}
            <Field label="Pay frequency">
              <select className={input} value={form.payFrequency} onChange={(ev) => set({ payFrequency: ev.target.value as PayFrequency })}>
                {(Object.keys(FREQUENCY_LABELS) as PayFrequency[]).map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="NI category">
              <select className={input} value={form.niCategory} onChange={(ev) => set({ niCategory: ev.target.value as NiCategory })}>
                {(Object.keys(NI_CATEGORIES) as NiCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {NI_CATEGORIES[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Student loan">
              <select className={input} value={form.studentLoanPlan} onChange={(ev) => set({ studentLoanPlan: ev.target.value })}>
                {Object.entries(PLANS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date of birth">
              <input type="date" className={`${input} font-num`} value={form.dateOfBirth} onChange={(ev) => set({ dateOfBirth: ev.target.value })} />
            </Field>
            <Field label="Employee pension %">
              <input className={`${input} font-num`} inputMode="decimal" value={form.pensionEmployeePct} onChange={(ev) => set({ pensionEmployeePct: ev.target.value })} disabled={!form.pensionEnrolled} />
            </Field>
            <Field label="Employer pension %">
              <input className={`${input} font-num`} inputMode="decimal" value={form.pensionEmployerPct} onChange={(ev) => set({ pensionEmployerPct: ev.target.value })} disabled={!form.pensionEnrolled} />
            </Field>
            <Field label="Leaving date (if leaving)">
              <input type="date" className={`${input} font-num`} value={form.leavingDate} onChange={(ev) => set({ leavingDate: ev.target.value })} />
            </Field>
            <Field label="P45 — pay in previous job this tax year (£)">
              <input className={`${input} font-num`} inputMode="decimal" value={form.previousPay} onChange={(ev) => set({ previousPay: ev.target.value })} />
            </Field>
            <Field label="P45 — tax paid in previous job (£)">
              <input className={`${input} font-num`} inputMode="decimal" value={form.previousTax} onChange={(ev) => set({ previousTax: ev.target.value })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4 text-[12.5px]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.pensionEnrolled} onChange={(ev) => set({ pensionEnrolled: ev.target.checked })} />
              Enrolled in workplace pension
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.postgradLoan} onChange={(ev) => set({ postgradLoan: ev.target.checked })} />
              Postgraduate loan
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isDirector} onChange={(ev) => set({ isDirector: ev.target.checked })} />
              Company director
            </label>
          </div>
          {error && <div className="text-[12.5px] text-[var(--critical-ink)]">{error}</div>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save pay details"}
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function toForm(e: Employee) {
  return {
    payBasis: e.pay_basis,
    annualSalary: e.annual_salary != null ? String(e.annual_salary) : "",
    hourlyRate: e.hourly_rate != null ? String(e.hourly_rate) : "",
    payFrequency: e.pay_frequency,
    niCategory: e.ni_category,
    studentLoanPlan: e.student_loan_plan ?? "",
    postgradLoan: e.postgrad_loan,
    pensionEnrolled: e.pension_enrolled,
    pensionEmployeePct: String(e.pension_employee_pct),
    pensionEmployerPct: String(e.pension_employer_pct),
    dateOfBirth: e.date_of_birth ?? "",
    isDirector: e.is_director,
    previousPay: String(e.previous_pay ?? 0),
    previousTax: String(e.previous_tax ?? 0),
    leavingDate: e.leaving_date ?? "",
  };
}
