"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson, postOrReport } from "@/lib/client-actions";

const btn = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50";
const primary = "rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50";
const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)]";
const label = "flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]";

type Bank = { accountName: string | null; sortCode: string | null; accountNumber: string | null; iban: string | null; bic: string | null };

export function BankForm({ url, name, initial, compact }: { url: string; name?: string; initial: Bank; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!compact);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [f, setF] = useState({ accountName: initial.accountName ?? "", sortCode: initial.sortCode ?? "", accountNumber: initial.accountNumber ?? "", iban: initial.iban ?? "", bic: initial.bic ?? "" });
  if (!open) {
    return (
      <button className="text-[12px] font-semibold text-[var(--accent-strong)] hover:underline" onClick={() => setOpen(true)}>
        {initial.sortCode || initial.iban ? "Edit bank details" : "Add bank details"}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <label className={label}>
          Account name
          <input className={input} value={f.accountName} onChange={(e) => setF({ ...f, accountName: e.target.value })} />
        </label>
        <label className={label}>
          Sort code
          <input className={`${input} font-num`} placeholder="12-34-56" value={f.sortCode} onChange={(e) => setF({ ...f, sortCode: e.target.value })} />
        </label>
        <label className={label}>
          Account number
          <input className={`${input} font-num`} placeholder="8 digits" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} />
        </label>
        <label className={label}>
          IBAN
          <input className={`${input} font-num`} value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value })} />
        </label>
        <label className={label}>
          BIC / SWIFT
          <input className={`${input} font-num`} value={f.bic} onChange={(e) => setF({ ...f, bic: e.target.value })} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          className={primary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setSaved(false);
            const ok = await postOrReport(url, { name, ...f });
            setBusy(false);
            if (ok) {
              setSaved(true);
              if (compact) setOpen(false);
              router.refresh();
            }
          }}
        >
          Save
        </button>
        {compact && (
          <button className={btn} onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
        {saved && !compact && <span className="text-[12.5px] text-[var(--good-ink)]">Saved.</span>}
      </div>
    </div>
  );
}

type Bill = { id: string; reference: string; supplier: string; dueDate: string; currency: string; amount: number; formats: string[]; problem: string | null; batchReference: string | null };

export function PayBills({ bills, formats, today }: { bills: Bill[]; formats: Record<string, string>; today: string }) {
  const router = useRouter();
  const [format, setFormat] = useState("csv");
  const [date, setDate] = useState(today);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const eligible = bills.filter((b) => !b.batchReference && b.formats.includes(format));
  const chosen = picked.filter((id) => eligible.some((b) => b.id === id));
  const totals = [...new Set(eligible.filter((b) => chosen.includes(b.id)).map((b) => b.currency))].map(
    (c) => `${c} ${eligible.filter((b) => chosen.includes(b.id) && b.currency === c).reduce((s, b) => s + b.amount, 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-[18px] py-3 text-[12.5px]">
        <select className={input} value={format} onChange={(e) => setFormat(e.target.value)} aria-label="File format">
          {Object.entries(formats).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        paying on
        <input type="date" min={today} className={`${input} font-num`} value={date} onChange={(e) => setDate(e.target.value)} />
        <button
          className={primary}
          disabled={busy || !chosen.length}
          onClick={async () => {
            setBusy(true);
            const res = await postJson<{ id: string }>("/api/payments/batch/create", { billIds: chosen, format, executionDate: date });
            setBusy(false);
            if (res) {
              setPicked([]);
              window.location.href = `/api/payments/batch/file?id=${res.id}`;
              router.refresh();
            }
          }}
        >
          {busy ? "Making file…" : `Make payment file${chosen.length ? ` (${chosen.length} · ${totals.join(", ")})` : ""}`}
        </button>
        <button className={btn} onClick={() => setPicked(eligible.map((b) => b.id))} disabled={!eligible.length}>
          Select all that fit
        </button>
      </div>
      {bills.length === 0 ? (
        <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">No unpaid bills.</div>
      ) : (
        bills.map((b) => {
          const fits = !b.batchReference && b.formats.includes(format);
          return (
            <label key={b.id} className={`flex items-center gap-3 border-b border-[var(--border)] px-[18px] py-2 text-[12.5px] last:border-b-0 ${fits ? "cursor-pointer hover:bg-[var(--surface-2)]" : "opacity-70"}`}>
              <input type="checkbox" disabled={!fits} checked={chosen.includes(b.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, b.id] : picked.filter((x) => x !== b.id))} />
              <span className="min-w-0 flex-1">
                <strong>{b.reference}</strong> {b.supplier} <span className="text-[var(--ink-muted)]">· due {b.dueDate}</span>
                <span className="block text-[11px] text-[var(--ink-muted)]">
                  {b.batchReference ? `In payment file ${b.batchReference}` : b.problem ?? (fits ? "Ready" : `Not in this format — use ${b.formats.map((f) => (f === "pain001" ? "pain.001" : f === "bacs18" ? "Bacs" : "CSV")).join(" or ")}`)}
                </span>
              </span>
              <span className="font-num font-semibold">
                {b.currency} {b.amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
              </span>
            </label>
          );
        })
      )}
    </div>
  );
}

export function BatchActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (url: string) => {
    setBusy(true);
    if (await postOrReport(url, { id })) router.refresh();
    setBusy(false);
  };
  return (
    <span className="flex gap-1.5">
      <button className={primary} disabled={busy} onClick={() => act("/api/payments/batch/paid")} title="The bank has accepted the file — record the payments">
        Mark paid
      </button>
      <button className={btn} disabled={busy} onClick={() => act("/api/payments/batch/cancel")} title="The file wasn't used — release its bills">
        Cancel
      </button>
    </span>
  );
}
