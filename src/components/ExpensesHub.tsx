"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import { StatRow, StatTile } from "@/components/StatTile";
import type { ExpenseClaim, MileageClaim, Employee } from "@/lib/queries";

const CLAIM_STYLES: Record<string, { bg: string; ink: string; label: string }> = {
  submitted: { bg: "var(--warning-soft)", ink: "var(--warning-ink)", label: "Awaiting approval" },
  approved: { bg: "var(--accent-soft)", ink: "var(--accent-strong)", label: "Approved" },
  reimbursed: { bg: "var(--good-soft)", ink: "var(--good-ink)", label: "Reimbursed" },
  rejected: { bg: "var(--critical-soft)", ink: "var(--critical-ink)", label: "Rejected" },
};

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className ?? "h-3.5 w-3.5"}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function ExpensesHub({
  employees,
  initialClaims,
  initialMileage,
  totals,
}: {
  employees: Employee[];
  initialClaims: ExpenseClaim[];
  initialMileage: MileageClaim[];
  totals: { pendingClaims: number; pendingClaimsTotal: number; pendingMileage: number; pendingMileageTotal: number };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"claims" | "mileage">("claims");
  const [claims, setClaims] = useState(initialClaims);
  const [mileage, setMileage] = useState(initialMileage);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [claimFormOpen, setClaimFormOpen] = useState(false);
  const [mileageFormOpen, setMileageFormOpen] = useState(false);

  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? "Unknown";

  async function setClaimStatus(id: string, status: ExpenseClaim["status"]) {
    setBusyId(id);
    setClaims((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    try {
      await fetch("/api/expenses/claims/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function setMileageStatus(id: string, status: MileageClaim["status"]) {
    setBusyId(id);
    setMileage((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
    try {
      await fetch("/api/expenses/mileage/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <StatRow>
        <StatTile label="Pending claims" value={gbp(totals.pendingClaimsTotal)} meta={<span>{totals.pendingClaims} awaiting approval</span>} />
        <StatTile label="Pending mileage" value={gbp(totals.pendingMileageTotal)} meta={<span>{totals.pendingMileage} awaiting approval</span>} />
        <StatTile label="Mileage rate" value="45p/mile" meta={<span>HMRC AMAP rate, first 10,000 business miles</span>} />
      </StatRow>

      <div className="mb-4 flex flex-wrap gap-[7px]">
        <button onClick={() => setTab("claims")} className={`rounded-full border px-[13px] py-[7px] text-[12.8px] font-semibold ${tab === "claims" ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"}`}>
          Expense claims <span className="font-num text-[var(--ink-muted)]">{claims.length}</span>
        </button>
        <button onClick={() => setTab("mileage")} className={`rounded-full border px-[13px] py-[7px] text-[12.8px] font-semibold ${tab === "mileage" ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"}`}>
          Mileage <span className="font-num text-[var(--ink-muted)]">{mileage.length}</span>
        </button>
      </div>

      {tab === "claims" && (
        <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px]">
            <div>
              <h2 className="font-display text-[16.5px] font-semibold">Expense claims</h2>
              <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Reimbursing a claim drops a debit onto the Verity Ledger bank feed</div>
            </div>
            <button onClick={() => setClaimFormOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]">
              <PlusIcon />
              Submit claim
            </button>
          </div>

          {claimFormOpen && (
            <NewClaimForm
              employees={employees}
              onCreated={(claim) => {
                setClaims((prev) => [claim, ...prev]);
                setClaimFormOpen(false);
                router.refresh();
              }}
              onCancel={() => setClaimFormOpen(false)}
            />
          )}

          <div>
            {claims.map((c, i) => {
              const s = CLAIM_STYLES[c.status];
              return (
                <div key={c.id} className={`flex flex-wrap items-center justify-between gap-3 px-[18px] py-[13px] ${i === claims.length - 1 ? "" : "border-b border-[var(--border)]"}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold">{employeeName(c.employee_id)}</span>
                      <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-[7px] py-0.5 text-[10.5px] font-semibold text-[var(--ink-secondary)]">{c.category}</span>
                      <span className="rounded-[6px] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ background: s.bg, color: s.ink }}>{s.label}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--ink-muted)]">{c.description} &middot; {c.expense_date}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-num text-[14px] font-semibold">{gbp(c.amount)}</span>
                    {c.status === "submitted" && (
                      <>
                        <button disabled={busyId === c.id} onClick={() => setClaimStatus(c.id, "approved")} className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50">Approve</button>
                        <button disabled={busyId === c.id} onClick={() => setClaimStatus(c.id, "rejected")} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)] disabled:opacity-50">Reject</button>
                      </>
                    )}
                    {c.status === "approved" && (
                      <button disabled={busyId === c.id} onClick={() => setClaimStatus(c.id, "reimbursed")} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">Reimburse</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === "mileage" && (
        <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px]">
            <div>
              <h2 className="font-display text-[16.5px] font-semibold">Mileage claims</h2>
              <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Amount is computed automatically at the HMRC 45p/mile rate</div>
            </div>
            <button onClick={() => setMileageFormOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]">
              <PlusIcon />
              Log trip
            </button>
          </div>

          {mileageFormOpen && (
            <NewMileageForm
              employees={employees}
              onCreated={(claim) => {
                setMileage((prev) => [claim, ...prev]);
                setMileageFormOpen(false);
                router.refresh();
              }}
              onCancel={() => setMileageFormOpen(false)}
            />
          )}

          <div>
            {mileage.map((m, i) => {
              const s = CLAIM_STYLES[m.status];
              return (
                <div key={m.id} className={`flex flex-wrap items-center justify-between gap-3 px-[18px] py-[13px] ${i === mileage.length - 1 ? "" : "border-b border-[var(--border)]"}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold">{employeeName(m.employee_id)}</span>
                      <span className="font-num rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-[7px] py-0.5 text-[10.5px] font-semibold text-[var(--ink-secondary)]">{m.miles} mi</span>
                      <span className="rounded-[6px] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ background: s.bg, color: s.ink }}>{s.label}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--ink-muted)]">{m.from_location} &rarr; {m.to_location} &middot; {m.trip_date}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-num text-[14px] font-semibold">{gbp(m.amount)}</span>
                    {m.status === "submitted" && (
                      <button disabled={busyId === m.id} onClick={() => setMileageStatus(m.id, "approved")} className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50">Approve</button>
                    )}
                    {m.status === "approved" && (
                      <button disabled={busyId === m.id} onClick={() => setMileageStatus(m.id, "reimbursed")} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">Reimburse</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function NewClaimForm({ employees, onCreated, onCancel }: { employees: Employee[]; onCreated: (claim: ExpenseClaim) => void; onCancel: () => void }) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!employeeId) return setError("Choose an employee.");
    if (!description.trim() || !category.trim()) return setError("Description and category are required.");
    if (!(Number(amount) > 0)) return setError("Amount must be positive.");
    if (!date.trim()) return setError("Date is required.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/expenses/claims/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, description, category, amount: Number(amount), expenseDate: date }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      onCreated(data.claim as ExpenseClaim);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-[18px] py-[16px]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]">
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category, e.g. Travel" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] sm:col-span-2" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount £" inputMode="decimal" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="Date, e.g. 20 Sep 2026" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
      </div>
      <div className="mt-3.5 flex items-center justify-end gap-2">
        {error && <span className="mr-auto text-[12px] font-semibold text-[var(--critical-ink)]">{error}</span>}
        <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface)]">Cancel</button>
        <button onClick={submit} disabled={submitting} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
          {submitting ? "Submitting…" : "Submit claim"}
        </button>
      </div>
    </div>
  );
}

function NewMileageForm({ employees, onCreated, onCancel }: { employees: Employee[]; onCreated: (claim: MileageClaim) => void; onCancel: () => void }) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [miles, setMiles] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimate = (Number(miles) || 0) * 0.45;

  async function submit() {
    setError(null);
    if (!employeeId) return setError("Choose an employee.");
    if (!from.trim() || !to.trim()) return setError("From and to locations are required.");
    if (!(Number(miles) > 0)) return setError("Miles must be positive.");
    if (!date.trim()) return setError("Date is required.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/expenses/mileage/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, tripDate: date, from, to, miles: Number(miles) }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      onCreated(data.claim as MileageClaim);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-[18px] py-[16px]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]">
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="Date, e.g. 20 Sep 2026" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="Miles" inputMode="decimal" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
      </div>
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <div className="text-[12.5px] text-[var(--ink-secondary)]">Reimbursement <span className="font-num font-semibold text-[var(--ink)]">{gbp(estimate)}</span> at 45p/mile</div>
        <div className="flex items-center gap-2">
          {error && <span className="text-[12px] font-semibold text-[var(--critical-ink)]">{error}</span>}
          <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface)]">Cancel</button>
          <button onClick={submit} disabled={submitting} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
            {submitting ? "Logging…" : "Log trip"}
          </button>
        </div>
      </div>
    </div>
  );
}
