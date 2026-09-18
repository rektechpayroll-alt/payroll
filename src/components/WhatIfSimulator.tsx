"use client";

import { useMemo, useState } from "react";
import { gbp } from "@/lib/format";
import { estimateGrossFromNet } from "@/lib/compliance";
import type { Employee, PayrollLine } from "@/lib/queries";

const EMPLOYER_NI_RATE = 0.138; // above the secondary threshold — illustrative flat rate for the simulator
const EMPLOYER_PENSION_RATE = 0.03; // minimum auto-enrolment employer contribution

type Tab = "hire" | "raise" | "bonus";

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold ${
        active ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-[var(--ink-secondary)]">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--accent)]";

function ResultRow({ label, before, after, isCurrency = true }: { label: string; before: number; after: number; isCurrency?: boolean }) {
  const delta = after - before;
  const fmt = (n: number) => (isCurrency ? gbp(n) : n.toFixed(1));
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-[13px] text-[var(--ink-secondary)]">{label}</span>
      <div className="text-right">
        <div className="font-num text-[14px] font-semibold">{fmt(after)}</div>
        <div className={`font-num text-[11px] ${delta > 0 ? "text-[var(--critical-ink)]" : delta < 0 ? "text-[var(--good-ink)]" : "text-[var(--ink-muted)]"}`}>
          {delta === 0 ? "no change" : `${delta > 0 ? "+" : ""}${fmt(delta)} vs today`}
        </div>
      </div>
    </div>
  );
}

export function WhatIfSimulator({
  employees,
  lines,
  baselineMonthlyCost,
  headcount,
  bonusBudget,
}: {
  employees: Employee[];
  lines: PayrollLine[];
  baselineMonthlyCost: number;
  headcount: number;
  bonusBudget: number;
}) {
  const [tab, setTab] = useState<Tab>("hire");

  const lineByEmployeeId = useMemo(() => {
    const map = new Map<string, PayrollLine>();
    lines.forEach((l) => l.employee_id && map.set(l.employee_id, l));
    return map;
  }, [lines]);

  // --- New hire ---
  const [hireSalary, setHireSalary] = useState(28000);
  const hireMonthlyCost = (hireSalary / 12) * (1 + EMPLOYER_NI_RATE + EMPLOYER_PENSION_RATE);

  // --- Raise ---
  const [raiseEmployeeId, setRaiseEmployeeId] = useState(employees[0]?.id ?? "");
  const [raisePct, setRaisePct] = useState(5);
  const raiseLine = lineByEmployeeId.get(raiseEmployeeId);
  const raiseCurrentMonthlyGross = raiseLine ? estimateGrossFromNet(raiseLine.net_pay) : 0;
  const raiseCurrentMonthlyCost = raiseCurrentMonthlyGross * (1 + EMPLOYER_NI_RATE + EMPLOYER_PENSION_RATE);
  const raiseNewMonthlyCost = raiseCurrentMonthlyCost * (1 + raisePct / 100);
  const raiseDeltaMonthly = raiseNewMonthlyCost - raiseCurrentMonthlyCost;

  // --- Bonus round ---
  const [bonusPool, setBonusPool] = useState(bonusBudget);
  const [bonusSpread, setBonusSpread] = useState<"all" | "flagged-clear">("all");
  const eligibleCount = bonusSpread === "all" ? headcount : lines.filter((l) => !l.severity || l.resolved).length;
  const perEmployeeBonus = eligibleCount > 0 ? bonusPool / eligibleCount : 0;
  const overBudget = bonusPool > bonusBudget;

  return (
    <div>
      <div className="mb-4 inline-flex gap-1 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-1">
        <TabButton active={tab === "hire"} onClick={() => setTab("hire")}>New hire</TabButton>
        <TabButton active={tab === "raise"} onClick={() => setTab("raise")}>Give a raise</TabButton>
        <TabButton active={tab === "bonus"} onClick={() => setTab("bonus")}>Bonus round</TabButton>
      </div>

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow)]">
          {tab === "hire" && (
            <div className="flex flex-col gap-4">
              <h3 className="text-[15px] font-semibold">Model a new hire</h3>
              <Field label="Annual salary">
                <input
                  type="number"
                  value={hireSalary}
                  onChange={(e) => setHireSalary(Number(e.target.value) || 0)}
                  className={inputClass}
                />
              </Field>
              <p className="text-[12.5px] text-[var(--ink-secondary)]">
                Assumes employer NI at {(EMPLOYER_NI_RATE * 100).toFixed(1)}% and the {(EMPLOYER_PENSION_RATE * 100).toFixed(0)}% minimum auto-enrolment employer pension contribution.
              </p>
            </div>
          )}

          {tab === "raise" && (
            <div className="flex flex-col gap-4">
              <h3 className="text-[15px] font-semibold">Model a raise</h3>
              <Field label="Employee">
                <select value={raiseEmployeeId} onChange={(e) => setRaiseEmployeeId(e.target.value)} className={inputClass}>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} — {e.role}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Raise (%)">
                <input
                  type="number"
                  value={raisePct}
                  onChange={(e) => setRaisePct(Number(e.target.value) || 0)}
                  className={inputClass}
                />
              </Field>
              {!raiseLine && <p className="text-[12.5px] text-[var(--warning-ink)]">No current-run pay data for this employee — estimate uses £0 as a baseline.</p>}
            </div>
          )}

          {tab === "bonus" && (
            <div className="flex flex-col gap-4">
              <h3 className="text-[15px] font-semibold">Model a bonus round</h3>
              <Field label="Total bonus pool">
                <input
                  type="number"
                  value={bonusPool}
                  onChange={(e) => setBonusPool(Number(e.target.value) || 0)}
                  className={inputClass}
                />
              </Field>
              <Field label="Spread across">
                <select value={bonusSpread} onChange={(e) => setBonusSpread(e.target.value as "all" | "flagged-clear")} className={inputClass}>
                  <option value="all">All {headcount} employees evenly</option>
                  <option value="flagged-clear">Only employees clear on this run ({lines.filter((l) => !l.severity || l.resolved).length})</option>
                </select>
              </Field>
              {overBudget && (
                <p className="text-[12.5px] font-semibold text-[var(--critical-ink)]">
                  This pool is {gbp(bonusPool - bonusBudget)} over the {gbp(bonusBudget)} available bonus budget for this quarter.
                </p>
              )}
            </div>
          )}
        </section>

        <aside className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow)]">
          <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Projected impact</h3>
          <div className="divide-y divide-[var(--border)]">
            {tab === "hire" && (
              <>
                <ResultRow label="Monthly cost to company" before={baselineMonthlyCost} after={baselineMonthlyCost + hireMonthlyCost} />
                <ResultRow label="Headcount" before={headcount} after={headcount + 1} isCurrency={false} />
                <ResultRow label="Added monthly cost" before={0} after={hireMonthlyCost} />
              </>
            )}
            {tab === "raise" && (
              <>
                <ResultRow label="This employee's monthly cost" before={raiseCurrentMonthlyCost} after={raiseNewMonthlyCost} />
                <ResultRow label="Monthly cost to company" before={baselineMonthlyCost} after={baselineMonthlyCost + raiseDeltaMonthly} />
                <ResultRow label="Annualised cost of this raise" before={0} after={raiseDeltaMonthly * 12} />
              </>
            )}
            {tab === "bonus" && (
              <>
                <ResultRow label="Per-employee bonus" before={0} after={perEmployeeBonus} />
                <ResultRow label="Bonus budget available" before={bonusBudget} after={bonusBudget} />
                <ResultRow label="Remaining after this round" before={bonusBudget} after={bonusBudget - bonusPool} />
              </>
            )}
          </div>
          <p className="mt-3 text-[11.5px] text-[var(--ink-muted)]">
            Illustrative planning estimate — nothing here changes actual payroll until a run includes it.
          </p>
        </aside>
      </div>
    </div>
  );
}
