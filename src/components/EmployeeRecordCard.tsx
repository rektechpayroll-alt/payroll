"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import type { Employee } from "@/lib/queries";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STARTER: Record<string, string> = {
  A: "A — first job since 6 April, no benefits/pension",
  B: "B — only job now, but had another since 6 April",
  C: "C — has another job or pension",
};

const mask = (acc: string | null) => (acc ? `••••${acc.slice(-4)}` : "Not set");

export function EmployeeRecordCard({ initialEmployee }: { initialEmployee: Employee }) {
  const router = useRouter();
  const [e, setE] = useState(initialEmployee);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(() => toForm(initialEmployee));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ReturnType<typeof toForm>>) => setF((prev) => ({ ...prev, ...patch }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/employees/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, ...f, payrolledBenefitsAnnual: Number(f.payrolledBenefitsAnnual) || 0 }),
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
  const label = "flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]";
  const workingDays = (e.working_days || "1,2,3,4,5").split(",").map(Number);
  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] lg:col-span-2">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-[18px] py-[15px] pb-[13px]">
        <h2 className="font-display text-[14.5px] font-semibold">HMRC &amp; bank details</h2>
        {!editing && (
          <button
            onClick={() => {
              setF(toForm(e));
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
          {[
            ["Bank account", e.bank_sort_code ? `${e.bank_sort_code.replace(/(\d{2})(\d{2})(\d{2})/, "$1-$2-$3")} · ${mask(e.bank_account_number)}` : "Not set"],
            ["Account name", e.bank_account_name ?? "—"],
            ["Address", [e.address_line1, e.address_line2, e.postcode].filter(Boolean).join(", ") || "Not set"],
            ["Gender (as held by HMRC)", e.gender === "M" ? "Male" : e.gender === "F" ? "Female" : "Not set"],
            ["Payroll ID", e.payroll_id ?? "—"],
            ["Starter declaration", e.starter_declaration ? STARTER[e.starter_declaration] : "—"],
            ["Working days", workingDays.map((d) => DAYS[d]).join(", ")],
            ["Payrolled benefits", e.payrolled_benefits_annual ? `${gbp(e.payrolled_benefits_annual)} / year` : "None"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="text-[var(--ink-muted)]">{k}</span>
              <span className="text-right font-medium">{v}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-[18px] py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className={label}>
              Account name
              <input className={input} value={f.bankAccountName} onChange={(ev) => set({ bankAccountName: ev.target.value })} />
            </label>
            <label className={label}>
              Sort code
              <input className={`${input} font-num`} placeholder="12-34-56" value={f.bankSortCode} onChange={(ev) => set({ bankSortCode: ev.target.value })} />
            </label>
            <label className={label}>
              Account number
              <input className={`${input} font-num`} value={f.bankAccountNumber} onChange={(ev) => set({ bankAccountNumber: ev.target.value })} />
            </label>
            <label className={label}>
              Address line 1
              <input className={input} value={f.addressLine1} onChange={(ev) => set({ addressLine1: ev.target.value })} />
            </label>
            <label className={label}>
              Address line 2
              <input className={input} value={f.addressLine2} onChange={(ev) => set({ addressLine2: ev.target.value })} />
            </label>
            <label className={label}>
              Postcode
              <input className={`${input} font-num`} value={f.postcode} onChange={(ev) => set({ postcode: ev.target.value })} />
            </label>
            <label className={label}>
              Gender (as held by HMRC)
              <select className={input} value={f.gender} onChange={(ev) => set({ gender: ev.target.value })}>
                <option value="">Not set</option>
                <option value="F">Female</option>
                <option value="M">Male</option>
              </select>
            </label>
            <label className={label}>
              Payroll ID
              <input className={`${input} font-num`} value={f.payrollId} onChange={(ev) => set({ payrollId: ev.target.value })} />
            </label>
            <label className={label}>
              Starter declaration (new starters)
              <select className={input} value={f.starterDeclaration} onChange={(ev) => set({ starterDeclaration: ev.target.value })}>
                <option value="">—</option>
                {Object.entries(STARTER).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Payrolled benefits — cash equivalent per year (£)
              <input className={`${input} font-num`} inputMode="decimal" value={f.payrolledBenefitsAnnual} onChange={(ev) => set({ payrolledBenefitsAnnual: ev.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
            <span className="font-semibold text-[var(--ink-secondary)]">Working days</span>
            {DAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={f.workingDays.includes(i)}
                  onChange={(ev) => set({ workingDays: ev.target.checked ? [...f.workingDays, i] : f.workingDays.filter((x) => x !== i) })}
                />
                {d}
              </label>
            ))}
          </div>
          {error && <div className="text-[12.5px] text-[var(--critical-ink)]">{error}</div>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
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
    bankAccountName: e.bank_account_name ?? "",
    bankSortCode: e.bank_sort_code ?? "",
    bankAccountNumber: e.bank_account_number ?? "",
    addressLine1: e.address_line1 ?? "",
    addressLine2: e.address_line2 ?? "",
    postcode: e.postcode ?? "",
    gender: e.gender ?? "",
    payrollId: e.payroll_id ?? "",
    starterDeclaration: e.starter_declaration ?? "",
    workingDays: (e.working_days || "1,2,3,4,5").split(",").map(Number),
    payrolledBenefitsAnnual: String(e.payrolled_benefits_annual ?? 0),
  };
}
