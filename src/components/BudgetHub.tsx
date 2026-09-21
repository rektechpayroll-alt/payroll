"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import { StatRow, StatTile } from "@/components/StatTile";
import type { BudgetLine } from "@/lib/queries";
import type { BudgetLineWithActual } from "@/lib/budget";

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className ?? "h-3.5 w-3.5"}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function BudgetHub({ initialLines, periodLabel }: { initialLines: BudgetLineWithActual[]; periodLabel: string }) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [formOpen, setFormOpen] = useState(false);

  const overCount = lines.filter((l) => l.isOverBudget).length;
  const totalBudgeted = lines.reduce((sum, l) => sum + l.budgeted_amount, 0);
  const totalActual = lines.reduce((sum, l) => sum + l.actual, 0);

  return (
    <div>
      <StatRow>
        <StatTile label="Budgeted" value={gbp(totalBudgeted)} meta={<span>{periodLabel} &middot; {lines.length} categories</span>} />
        <StatTile label="Actual" value={gbp(totalActual)} meta={<span>{(totalBudgeted > 0 ? (totalActual / totalBudgeted) * 100 : 0).toFixed(0)}% of budget used</span>} />
        <StatTile
          label="Over budget"
          value={String(overCount)}
          meta={<span>categories exceeding their limit</span>}
          pill={overCount > 0 ? { tone: "warn", icon: <PlusIcon className="h-2.5 w-2.5" />, text: "Needs review" } : { tone: "good", icon: <PlusIcon className="h-2.5 w-2.5" />, text: "On track" }}
        />
      </StatRow>

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px]">
          <div>
            <h2 className="font-display text-[16.5px] font-semibold">Budget vs actual</h2>
            <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Actual spend is computed live from bills, expense claims, mileage and standalone bank debits — never entered by hand</div>
          </div>
          <button onClick={() => setFormOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]">
            <PlusIcon />
            New budget line
          </button>
        </div>

        {formOpen && (
          <NewBudgetLineForm
            periodLabel={periodLabel}
            onCreated={(line) => {
              setLines((prev) => [...prev, { ...line, actual: 0, variance: line.budgeted_amount, percentUsed: 0, isOverBudget: false }]);
              setFormOpen(false);
              router.refresh();
            }}
            onCancel={() => setFormOpen(false)}
          />
        )}

        <div>
          {lines.map((l, i) => {
            const pct = Math.min(100, Math.max(0, l.percentUsed));
            return (
              <div key={l.id} className={`px-[18px] py-[13px] ${i === lines.length - 1 ? "" : "border-b border-[var(--border)]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold">{l.category}</span>
                    {l.isOverBudget && (
                      <span className="rounded-[6px] bg-[var(--critical-soft)] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--critical-ink)]">Over budget</span>
                    )}
                  </div>
                  <span className="font-num text-[13.5px] font-semibold">{gbp(l.actual)} <span className="text-[var(--ink-muted)]">of {gbp(l.budgeted_amount)}</span></span>
                </div>
                <div className="mt-2 h-[6px] overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: l.isOverBudget ? "var(--critical)" : "var(--accent)" }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function NewBudgetLineForm({ periodLabel, onCreated, onCancel }: { periodLabel: string; onCreated: (line: BudgetLine) => void; onCancel: () => void }) {
  const [category, setCategory] = useState("");
  const [budgeted, setBudgeted] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!category.trim()) return setError("Category is required.");
    if (!(Number(budgeted) > 0)) return setError("Budgeted amount must be positive.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/budget/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, periodLabel, budgetedAmount: Number(budgeted) }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      onCreated(data.line as BudgetLine);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-[18px] py-[16px]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category, e.g. Travel & subsistence" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={budgeted} onChange={(e) => setBudgeted(e.target.value)} placeholder={`Budgeted £ for ${periodLabel}`} inputMode="decimal" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
      </div>
      <div className="mt-3.5 flex items-center justify-end gap-2">
        {error && <span className="mr-auto text-[12px] font-semibold text-[var(--critical-ink)]">{error}</span>}
        <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface)]">Cancel</button>
        <button onClick={submit} disabled={submitting} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
          {submitting ? "Creating…" : "Add budget line"}
        </button>
      </div>
    </div>
  );
}
