"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postOrReport } from "@/lib/client-actions";
import type { CompanyProfile, RecurringInvoice } from "@/lib/invoicing/service";

const btn = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50";
const primary = "rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50";
const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)]";
const label = "flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]";

export function CompanyProfileForm({ profile }: { profile: CompanyProfile }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: profile.name,
    addressLine1: profile.address_line1 ?? "",
    addressLine2: profile.address_line2 ?? "",
    city: profile.city ?? "",
    postcode: profile.postcode ?? "",
    contactEmail: profile.contact_email ?? "",
    phone: profile.phone ?? "",
    companyNumber: profile.company_number ?? "",
    paymentTermsDays: String(profile.payment_terms_days),
    remindersEnabled: profile.reminders_enabled,
    reminderDays: profile.reminder_days,
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={label}>
          Business name
          <input className={input} value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className={label}>
          Address line 1
          <input className={input} value={f.addressLine1} onChange={(e) => set({ addressLine1: e.target.value })} />
        </label>
        <label className={label}>
          Address line 2
          <input className={input} value={f.addressLine2} onChange={(e) => set({ addressLine2: e.target.value })} />
        </label>
        <label className={label}>
          Town or city
          <input className={input} value={f.city} onChange={(e) => set({ city: e.target.value })} />
        </label>
        <label className={label}>
          Postcode
          <input className={`${input} font-num`} value={f.postcode} onChange={(e) => set({ postcode: e.target.value })} />
        </label>
        <label className={label}>
          Accounts email (replies go here)
          <input className={input} value={f.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
        </label>
        <label className={label}>
          Phone
          <input className={input} value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </label>
        <label className={label}>
          Companies House number (if a company)
          <input className={`${input} font-num`} value={f.companyNumber} onChange={(e) => set({ companyNumber: e.target.value })} />
        </label>
        <label className={label}>
          Default payment terms (days)
          <input className={`${input} font-num`} inputMode="numeric" value={f.paymentTermsDays} onChange={(e) => set({ paymentTermsDays: e.target.value })} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.remindersEnabled} onChange={(e) => set({ remindersEnabled: e.target.checked })} />
          Email payment reminders automatically
        </label>
        {f.remindersEnabled && (
          <label className="flex items-center gap-2">
            on these days after the due date
            <input className={`${input} font-num w-[140px]`} value={f.reminderDays} onChange={(e) => set({ reminderDays: e.target.value })} />
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          className={primary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setSaved(false);
            const ok = await postOrReport("/api/company/profile", { ...f, paymentTermsDays: Number(f.paymentTermsDays) });
            setBusy(false);
            if (ok) {
              setSaved(true);
              router.refresh();
            }
          }}
        >
          Save business details
        </button>
        {saved && <span className="text-[12.5px] text-[var(--good-ink)]">Saved.</span>}
      </div>
    </div>
  );
}

type Line = { description: string; quantity: string; unitPrice: string };

export function RecurringForm({ defaultDueDays }: { defaultDueDays: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ customerName: "", customerEmail: "", frequency: "monthly", firstDate: new Date().toISOString().slice(0, 10), endDate: "", dueDays: String(defaultDueDays), vatRate: "20", autoSend: false, notes: "" });
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: "1", unitPrice: "" }]);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  if (!open) return <button className={primary} onClick={() => setOpen(true)}>New recurring invoice</button>;
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className={label}>
          Customer
          <input className={input} value={f.customerName} onChange={(e) => set({ customerName: e.target.value })} />
        </label>
        <label className={label}>
          Customer email
          <input className={input} value={f.customerEmail} onChange={(e) => set({ customerEmail: e.target.value })} />
        </label>
        <label className={label}>
          Every
          <select className={input} value={f.frequency} onChange={(e) => set({ frequency: e.target.value })}>
            <option value="weekly">Week</option>
            <option value="monthly">Month</option>
            <option value="quarterly">Quarter</option>
            <option value="yearly">Year</option>
          </select>
        </label>
        <label className={label}>
          VAT
          <select className={input} value={f.vatRate} onChange={(e) => set({ vatRate: e.target.value })}>
            <option value="20">20%</option>
            <option value="5">5%</option>
            <option value="0">None</option>
          </select>
        </label>
        <label className={label}>
          First invoice on
          <input type="date" className={`${input} font-num`} value={f.firstDate} onChange={(e) => set({ firstDate: e.target.value })} />
        </label>
        <label className={label}>
          Stop after (optional)
          <input type="date" className={`${input} font-num`} value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
        </label>
        <label className={label}>
          Payment due (days)
          <input className={`${input} font-num`} inputMode="numeric" value={f.dueDays} onChange={(e) => set({ dueDays: e.target.value })} />
        </label>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_90px_120px] gap-2">
          <input className={input} placeholder="Description" value={l.description} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
          <input className={`${input} font-num`} placeholder="Qty" inputMode="decimal" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
          <input className={`${input} font-num`} placeholder="Unit price £" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))} />
        </div>
      ))}
      <button className="self-start text-[12px] font-semibold text-[var(--accent-strong)] hover:underline" onClick={() => setLines((ls) => [...ls, { description: "", quantity: "1", unitPrice: "" }])}>
        + Add line
      </button>
      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" checked={f.autoSend} onChange={(e) => set({ autoSend: e.target.checked })} />
        Send each invoice to the customer automatically (otherwise it&rsquo;s saved as a draft for you to check)
      </label>
      <div className="flex gap-2">
        <button
          className={primary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await postOrReport("/api/invoices/recurring/create", {
              ...f,
              dueDays: Number(f.dueDays),
              vatRate: Number(f.vatRate),
              items: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
            });
            setBusy(false);
            if (ok) {
              setOpen(false);
              router.refresh();
            }
          }}
        >
          {busy ? "Saving…" : "Save schedule"}
        </button>
        <button className={btn} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function RecurringRow({ r }: { r: RecurringInvoice }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const total = r.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * (1 + r.vat_rate / 100);
  const act = async (url: string, body: unknown) => {
    setBusy(true);
    if (await postOrReport(url, body)) router.refresh();
    setBusy(false);
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-[18px] py-3 last:border-b-0 text-[12.5px]">
      <div>
        <div className="text-[13.5px] font-semibold">
          {r.customer_name} <span className="font-normal text-[var(--ink-muted)]">· {r.frequency}{r.auto_send ? " · sent automatically" : " · saved as draft"}</span>
        </div>
        <div className="text-[var(--ink-muted)]">
          {r.items.map((i) => i.description).join(", ")} · £{total.toFixed(2)} incl. VAT ·{" "}
          {r.active ? `next on ${r.next_date}` : "paused"}
          {r.end_date ? ` · ends ${r.end_date}` : ""}
        </div>
      </div>
      <div className="flex gap-2">
        <button className={btn} disabled={busy} onClick={() => act("/api/invoices/recurring/toggle", { id: r.id, active: !r.active })}>
          {r.active ? "Pause" : "Resume"}
        </button>
        <button className={btn} disabled={busy} onClick={() => act("/api/invoices/recurring/delete", { id: r.id })}>
          Delete
        </button>
      </div>
    </div>
  );
}

export function RemindButton({ invoiceId, step, disabled }: { invoiceId: string; step: number; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={btn}
      disabled={busy || disabled}
      onClick={async () => {
        setBusy(true);
        if (await postOrReport("/api/invoices/remind", { id: invoiceId, step })) router.refresh();
        setBusy(false);
      }}
    >
      {busy ? "Sending…" : "Send now"}
    </button>
  );
}
