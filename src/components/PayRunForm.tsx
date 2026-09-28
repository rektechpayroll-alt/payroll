"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FREQUENCY_LABELS, type PayFrequency } from "@/lib/payroll/engine";

export function PayRunForm({ frequencies, defaultPayDate }: { frequencies: PayFrequency[]; defaultPayDate: string }) {
  const router = useRouter();
  const [frequency, setFrequency] = useState<PayFrequency>(frequencies[0] ?? "monthly");
  const [payDate, setPayDate] = useState(defaultPayDate);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/runs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency, payDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't start the pay run.");
      router.push(`/dashboard/payroll/${data.runId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]";
  return (
    <form onSubmit={submit} className="flex max-w-[420px] flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Pay frequency</span>
        <select className={input} value={frequency} onChange={(e) => setFrequency(e.target.value as PayFrequency)}>
          {(Object.keys(FREQUENCY_LABELS) as PayFrequency[]).map((f) => (
            <option key={f} value={f} disabled={!frequencies.includes(f)}>
              {FREQUENCY_LABELS[f]}
              {frequencies.includes(f) ? "" : " — nobody on this schedule"}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Payday</span>
        <input type="date" className={`${input} font-num`} value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
        <span className="text-[11.5px] text-[var(--ink-muted)]">
          The date employees are paid. It decides the tax period — and the pay period is the calendar month (monthly) or the weeks ending on this date.
        </span>
      </label>
      {error && <div className="text-[12.5px] text-[var(--critical-ink)]">{error}</div>}
      <button
        type="submit"
        disabled={submitting || !frequencies.length}
        className="self-start rounded-lg bg-[var(--accent)] px-4 py-2.5 text-[13px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
      >
        {submitting ? "Calculating payslips…" : "Calculate pay run"}
      </button>
    </form>
  );
}
