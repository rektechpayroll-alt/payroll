"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";

type Account = { code: string; name: string };
type Line = { accountCode: string; description: string; debit: string; credit: string };
const blank = (): Line => ({ accountCode: "", description: "", debit: "", credit: "" });

export function ManualJournalForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dr = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const cr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(dr - cr) < 0.005 && dr > 0;
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ledger/journals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, narration, lines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't post the journal.");
      setOpen(false);
      setNarration("");
      setLines([blank(), blank()]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post the journal.");
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] text-[var(--ink)]";
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]">
        New manual journal
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]">
          Date
          <input type="date" className={`${input} font-num`} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]">
          Narration
          <input className={input} value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="e.g. Opening balances at 1 April" />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
              <th className="pb-1 font-semibold">Account</th>
              <th className="pb-1 font-semibold">Description</th>
              <th className="pb-1 text-right font-semibold">Debit</th>
              <th className="pb-1 text-right font-semibold">Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <select className={`${input} w-full`} value={l.accountCode} onChange={(e) => update(i, { accountCode: e.target.value })}>
                    <option value="">Choose account…</option>
                    {accounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input className={`${input} w-full`} value={l.description} onChange={(e) => update(i, { description: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input className={`${input} font-num w-[110px] text-right`} inputMode="decimal" value={l.debit} onChange={(e) => update(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
                </td>
                <td className="py-1">
                  <input className={`${input} font-num w-[110px] text-right`} inputMode="decimal" value={l.credit} onChange={(e) => update(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="pt-2">
                <button onClick={() => setLines((ls) => [...ls, blank()])} className="text-[12px] font-semibold text-[var(--accent-strong)] hover:underline">
                  + Add line
                </button>
              </td>
              <td className="pt-2 text-right text-[12px] text-[var(--ink-muted)]">Totals</td>
              <td className="font-num pt-2 text-right">{gbp(dr)}</td>
              <td className="font-num pt-2 text-right">{gbp(cr)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {!balanced && dr + cr > 0 && <div className="text-[12px] text-[var(--warning-ink)]">Debits and credits must be equal — off by {gbp(Math.abs(dr - cr))}.</div>}
      {error && <div className="text-[12.5px] text-[var(--critical-ink)]">{error}</div>}
      <div className="flex gap-2">
        <button disabled={busy || !balanced} onClick={save} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
          {busy ? "Posting…" : "Post journal"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]">
          Cancel
        </button>
      </div>
    </div>
  );
}
