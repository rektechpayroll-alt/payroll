"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postOrReport } from "@/lib/client-actions";

const btn = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50";
const primary = "rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50";
const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)]";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (url: string, body: unknown) => {
    setBusy(true);
    const ok = await postOrReport(url, body);
    setBusy(false);
    if (ok) router.refresh();
    return ok;
  };
  return { busy, run };
}

export function ForecastItemForm({ today }: { today: string }) {
  const { busy, run } = useAction();
  const [f, setF] = useState({ date: today, label: "", amount: "", direction: "out" });
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
      <select className={input} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>
        <option value="out">Money out</option>
        <option value="in">Money in</option>
      </select>
      <input className={`${input} w-[190px]`} placeholder="e.g. New van, bank loan" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
      <input className={`${input} font-num w-[110px]`} placeholder="£" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
      on
      <input type="date" className={`${input} font-num`} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <button
        className={primary}
        disabled={busy || !f.label || !f.amount}
        onClick={async () => {
          const amount = Math.abs(Number(f.amount)) * (f.direction === "out" ? -1 : 1);
          if (await run("/api/forecast/items/create", { date: f.date, label: f.label, amount })) setF({ ...f, label: "", amount: "" });
        }}
      >
        Add to forecast
      </button>
    </div>
  );
}

export function RemoveForecastItem({ id }: { id: string }) {
  const { busy, run } = useAction();
  return (
    <button className="rounded-md px-1.5 text-[11.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]" disabled={busy} onClick={() => run("/api/forecast/items/delete", { id })}>
      Remove
    </button>
  );
}

export function SuggestBudgetsButton({ start }: { start: string }) {
  const { busy, run } = useAction();
  return (
    <button className={primary} disabled={busy} onClick={() => run("/api/budgets/suggest", { start })}>
      {busy ? "Filling…" : "Fill empty budgets with suggestions"}
    </button>
  );
}

export function BudgetEditor({ start, code, months, budget, suggestion, basis }: { start: string; code: string; months: string[]; budget: number[]; suggestion: number[]; basis: string }) {
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(budget.map((b) => (b ? String(b) : "")));
  const [every, setEvery] = useState("");
  if (!open) {
    return (
      <button className="text-[12px] font-semibold text-[var(--accent-strong)] hover:underline" onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }
  const label = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  return (
    <div className="col-span-full mt-2 flex flex-col gap-2 rounded-[10px] bg-[var(--surface-2)] p-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
        {months.map((m, i) => (
          <label key={m} className="flex flex-col gap-0.5 text-[10.5px] font-semibold text-[var(--ink-muted)]">
            {label(m)}
            <input
              className={`${input} font-num w-full px-1.5`}
              inputMode="decimal"
              value={values[i]}
              onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <input className={`${input} font-num w-[100px]`} placeholder="£ each month" inputMode="decimal" value={every} onChange={(e) => setEvery(e.target.value)} />
        <button className={btn} disabled={!every} onClick={() => setValues(months.map(() => every))}>
          Same every month
        </button>
        <button className={btn} onClick={() => setValues(suggestion.map((s) => (s ? String(s) : "")))} title={basis}>
          Use suggestion ({basis.toLowerCase()})
        </button>
        <span className="flex-1" />
        <button className={btn} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          className={primary}
          disabled={busy}
          onClick={async () => {
            if (await run("/api/budgets/set", { start, code, amounts: values.map((v) => Number(v || 0)) })) setOpen(false);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function DashboardCustomiser({ current, all }: { current: string[]; all: Record<string, string> }) {
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(current);
  const move = (i: number, by: number) => {
    const next = [...list];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setList(next);
  };
  if (!open) {
    return (
      <button className={btn} onClick={() => setOpen(true)}>
        Customise
      </button>
    );
  }
  const hidden = Object.keys(all).filter((k) => !list.includes(k));
  return (
    <div className="w-full rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
      <div className="mb-2 text-[13px] font-semibold">Your dashboard — only you see this layout</div>
      <div className="flex flex-col divide-y divide-[var(--border)]">
        {list.map((k, i) => (
          <div key={k} className="flex items-center justify-between gap-2 py-1.5 text-[12.5px]">
            <span>{all[k]}</span>
            <span className="flex gap-1">
              <button className={btn} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </button>
              <button className={btn} disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                ↓
              </button>
              <button className={btn} onClick={() => setList(list.filter((x) => x !== k))}>
                Hide
              </button>
            </span>
          </div>
        ))}
      </div>
      {hidden.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
          Add:
          {hidden.map((k) => (
            <button key={k} className={btn} onClick={() => setList([...list, k])}>
              + {all[k]}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          className={primary}
          disabled={busy}
          onClick={async () => {
            if (await run("/api/insights/layout", { widgets: list })) setOpen(false);
          }}
        >
          Save layout
        </button>
        <button className={btn} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
