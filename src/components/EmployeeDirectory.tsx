"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import type { Employee, PayrollLine } from "@/lib/queries";

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className ?? "h-3.5 w-3.5"}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function statusFor(line: PayrollLine | undefined): { label: string; bg: string; ink: string } {
  if (!line) return { label: "No current run", bg: "var(--surface-2)", ink: "var(--ink-muted)" };
  if (!line.severity) return { label: "Clear", bg: "var(--good-soft)", ink: "var(--good-ink)" };
  if (line.resolved) return { label: "Resolved", bg: "var(--good-soft)", ink: "var(--good-ink)" };
  const bySeverity: Record<string, { bg: string; ink: string }> = {
    critical: { bg: "var(--critical-soft)", ink: "var(--critical-ink)" },
    serious: { bg: "var(--serious-soft)", ink: "var(--serious-ink)" },
    warning: { bg: "var(--warning-soft)", ink: "var(--warning-ink)" },
  };
  const c = bySeverity[line.severity];
  return { label: "Flagged", bg: c.bg, ink: c.ink };
}

export function EmployeeDirectory({ employees: initialEmployees, lines }: { employees: Employee[]; lines: PayrollLine[] }) {
  const router = useRouter();
  const [employees, setEmployees] = useState(initialEmployees);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const lineByEmployeeId = useMemo(() => {
    const map = new Map<string, PayrollLine>();
    lines.forEach((l) => {
      if (l.employee_id) map.set(l.employee_id, l);
    });
    return map;
  }, [lines]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)
    );
  }, [employees, query]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative w-full max-w-[320px]">
          <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, role, or email"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-[13.5px] outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div className="text-[12.5px] text-[var(--ink-muted)]">
          {filtered.length} of {employees.length}
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
        >
          <PlusIcon />
          New employee
        </button>
      </div>

      {formOpen && (
        <NewEmployeeForm
          onCreated={(employee) => {
            setEmployees((prev) => [...prev, employee]);
            setFormOpen(false);
            router.refresh();
          }}
          onCancel={() => setFormOpen(false)}
        />
      )}

      <div className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <table className="w-full border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Net pay · this run</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => {
              const line = lineByEmployeeId.get(e.id);
              const status = statusFor(line);
              return (
                <tr key={e.id} className={i < filtered.length - 1 ? "border-b border-[var(--border)]" : ""}>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/employees/${e.id}`} className="font-semibold text-[var(--ink)] hover:text-[var(--accent-strong)] hover:underline">
                      {e.name}
                    </Link>
                    <div className="text-[11.5px] text-[var(--ink-muted)]">{e.email}</div>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-secondary)]">{e.role}</td>
                  <td className="px-4 py-3 text-[var(--ink-secondary)]">{e.employment_type}</td>
                  <td className="px-4 py-3 font-num text-[var(--ink)]">{line ? gbp(line.net_pay) : "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ background: status.bg, color: status.ink }}
                    >
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[13px] text-[var(--ink-muted)]">
                  No employees match &ldquo;{query}&rdquo;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewEmployeeForm({ onCreated, onCancel }: { onCreated: (employee: Employee) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [employmentType, setEmploymentType] = useState("Full-time");
  const [startDate, setStartDate] = useState("");
  const [taxCode, setTaxCode] = useState("1257L");
  const [niNumber, setNiNumber] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("37.5");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim() || !role.trim() || !email.trim() || !startDate.trim()) {
      return setError("Name, role, email and start date are required.");
    }
    if (!(Number(weeklyHours) > 0)) return setError("Weekly hours must be positive.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/employees/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          email,
          employmentType,
          startDate,
          taxCode,
          niNumber: niNumber || undefined,
          weeklyHours: Number(weeklyHours),
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      onCreated(data.employee as Employee);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow)]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]">
          <option>Full-time</option>
          <option>Part-time</option>
        </select>
        <input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Start date, e.g. 1 Oct 2026" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} placeholder="Weekly hours" inputMode="decimal" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} placeholder="Tax code" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={niNumber} onChange={(e) => setNiNumber(e.target.value)} placeholder="NI number (optional at this stage)" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)] sm:col-span-2" />
      </div>
      <div className="mt-3.5 flex items-center justify-end gap-2">
        {error && <span className="mr-auto text-[12px] font-semibold text-[var(--critical-ink)]">{error}</span>}
        <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]">Cancel</button>
        <button onClick={submit} disabled={submitting} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
          {submitting ? "Creating…" : "Add employee"}
        </button>
      </div>
    </div>
  );
}
