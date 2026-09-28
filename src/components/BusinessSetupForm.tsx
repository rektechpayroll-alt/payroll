"use client";

import { useState } from "react";
import { PAY_SCHEDULES } from "@/lib/pay-schedules";

export function BusinessSetupForm() {
  const [name, setName] = useState("");
  const [paySchedule, setPaySchedule] = useState<string>("Monthly");
  const [employeeCount, setEmployeeCount] = useState("");
  const [sampleData, setSampleData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/companies/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, paySchedule, employeeCount: Number(employeeCount) || 0, sampleData }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't create your business — please try again.");
      // Full navigation so every server component re-reads the new active business.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load makes every server component re-read the active business
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const input =
    "w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--accent)]";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Business name</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northgate Dental Ltd" required autoFocus />
      </label>
      <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">Pay schedule</span>
          <select className={input} value={paySchedule} onChange={(e) => setPaySchedule(e.target.value)}>
            {PAY_SCHEDULES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">Number of employees</span>
          <input className={input} type="number" min={0} value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value)} placeholder="0" />
        </label>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
        <input type="checkbox" className="mt-0.5" checked={sampleData} onChange={(e) => setSampleData(e.target.checked)} />
        <span className="text-[12.5px] leading-snug">
          <span className="font-semibold">Start with sample data</span>
          <span className="block text-[var(--ink-muted)]">
            Fill this business with example employees, invoices and a payroll run so you can explore. Leave unticked to start with clean books.
          </span>
        </span>
      </label>
      {error && <div className="text-[12.5px] text-[var(--critical-ink)]">{error}</div>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
      >
        {submitting ? "Setting up your business…" : "Create business"}
      </button>
    </form>
  );
}
