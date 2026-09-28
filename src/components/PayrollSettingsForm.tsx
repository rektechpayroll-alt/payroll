"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PENSION_SCHEMES, type PensionScheme } from "@/lib/payroll/engine";
import type { PayrollSettings } from "@/lib/payroll/records";

export function PayrollSettingsForm({ settings }: { settings: PayrollSettings }) {
  const router = useRouter();
  const [f, setF] = useState({
    payeReference: settings.paye_reference ?? "",
    accountsOfficeReference: settings.accounts_office_reference ?? "",
    pensionScheme: settings.pension_scheme,
    claimEmploymentAllowance: settings.claim_employment_allowance,
    smallEmployerRelief: settings.small_employer_relief,
    bankAccountName: settings.bank_account_name ?? "",
    bankSortCode: settings.bank_sort_code ?? "",
    bankAccountNumber: settings.bank_account_number ?? "",
    bacsSun: settings.bacs_sun ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/company/payroll-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? { ok: true, text: "Payroll settings saved." } : { ok: false, text: data.error ?? "Couldn't save." });
      if (res.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]";
  const label = "flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]";
  return (
    <section className="mt-[18px] rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <div className="border-b border-[var(--border)] px-[18px] py-[15px] pb-[13px]">
        <h2 className="font-display text-[14.5px] font-semibold">Payroll &amp; HMRC</h2>
        <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Your employer references, pension scheme, reliefs and the bank account wages are paid from</div>
      </div>
      <div className="grid grid-cols-1 gap-3 px-[18px] py-4 md:grid-cols-3">
        <label className={label}>
          Employer PAYE reference
          <input className={`${input} font-num`} placeholder="123/AB45678" value={f.payeReference} onChange={(e) => set({ payeReference: e.target.value })} />
        </label>
        <label className={label}>
          Accounts Office reference
          <input className={`${input} font-num`} placeholder="123PA00012345" value={f.accountsOfficeReference} onChange={(e) => set({ accountsOfficeReference: e.target.value })} />
        </label>
        <label className={label}>
          Workplace pension scheme
          <select className={input} value={f.pensionScheme} onChange={(e) => set({ pensionScheme: e.target.value as PensionScheme })}>
            {(Object.keys(PENSION_SCHEMES) as PensionScheme[]).map((k) => (
              <option key={k} value={k}>
                {PENSION_SCHEMES[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Bank account name (wages paid from)
          <input className={input} value={f.bankAccountName} onChange={(e) => set({ bankAccountName: e.target.value })} />
        </label>
        <label className={label}>
          Sort code
          <input className={`${input} font-num`} placeholder="12-34-56" value={f.bankSortCode} onChange={(e) => set({ bankSortCode: e.target.value })} />
        </label>
        <label className={label}>
          Account number
          <input className={`${input} font-num`} value={f.bankAccountNumber} onChange={(e) => set({ bankAccountNumber: e.target.value })} />
        </label>
        <label className={label}>
          BACS Service User Number (optional)
          <input className={`${input} font-num`} placeholder="6 digits" value={f.bacsSun} onChange={(e) => set({ bacsSun: e.target.value })} />
        </label>
        <div className="flex flex-col gap-2 text-[12.5px] md:col-span-2">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={f.claimEmploymentAllowance} onChange={(e) => set({ claimEmploymentAllowance: e.target.checked })} />
            <span>
              Claim Employment Allowance <span className="text-[var(--ink-muted)]">— up to £10,500 a year off employer NI. Not available if the only employee paid above the secondary threshold is a director.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={f.smallEmployerRelief} onChange={(e) => set({ smallEmployerRelief: e.target.checked })} />
            <span>
              Small Employers&rsquo; Relief <span className="text-[var(--ink-muted)]">— paid £45,000 or less Class 1 NI last tax year: recover 109% of statutory family pay instead of 92%.</span>
            </span>
          </label>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-[var(--border)] px-[18px] py-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save payroll settings"}
        </button>
        {message && <span className="text-[12.5px]" style={{ color: message.ok ? "var(--good-ink)" : "var(--critical-ink)" }}>{message.text}</span>}
      </div>
    </section>
  );
}
