"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Employee, PayrollLine } from "@/lib/queries";

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EmployeeProfileCard({ initialEmployee, line }: { initialEmployee: Employee; line: PayrollLine | null }) {
  const router = useRouter();
  const [employee, setEmployee] = useState(initialEmployee);
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(employee.role);
  const [email, setEmail] = useState(employee.email);
  const [employmentType, setEmploymentType] = useState(employee.employment_type);
  const [taxCode, setTaxCode] = useState(employee.tax_code);
  const [niNumber, setNiNumber] = useState(employee.ni_number);
  const [weeklyHours, setWeeklyHours] = useState(String(employee.weekly_hours));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setRole(employee.role);
    setEmail(employee.email);
    setEmploymentType(employee.employment_type);
    setTaxCode(employee.tax_code);
    setNiNumber(employee.ni_number);
    setWeeklyHours(String(employee.weekly_hours));
    setError(null);
    setEditing(true);
  }

  async function save() {
    setError(null);
    if (!role.trim() || !email.trim() || !taxCode.trim() || !niNumber.trim()) return setError("All fields are required.");
    if (!(Number(weeklyHours) > 0)) return setError("Weekly hours must be positive.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/employees/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: employee.id, role, email, employmentType, taxCode, niNumber, weeklyHours: Number(weeklyHours) }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      setEmployee(data.employee as Employee);
      setEditing(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-[18px] py-[15px] pb-[13px]">
        <h2 className="font-display text-[14.5px] font-semibold">Profile</h2>
        {!editing && (
          <button onClick={startEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-[11.5px] font-semibold hover:bg-[var(--surface-2)]">
            <EditIcon />
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div className="flex flex-col gap-2.5 px-[18px] py-4 text-[13px]">
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Role</span>
            <span className="font-medium">{employee.role}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Email</span>
            <span className="font-medium">{employee.email}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Employment type</span>
            <span className="font-medium">{employee.employment_type}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Weekly hours</span>
            <span className="font-medium font-num">{employee.weekly_hours}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Start date</span>
            <span className="font-medium font-num">{employee.start_date}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">Tax code</span>
            <span className="font-medium font-num">{employee.tax_code}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--ink-muted)]">NI number</span>
            <span className="font-medium font-num">{employee.ni_number}</span>
          </div>
          {line && (
            <div className="mt-1.5 border-t border-[var(--border)] pt-2.5">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Current run status</div>
              {line.severity && !line.resolved ? (
                <p className="text-[var(--ink-secondary)]">
                  <strong className="text-[var(--ink)]">{line.tag_label}</strong> — {line.reason}
                </p>
              ) : (
                <p className="text-[var(--good-ink)]">Validated automatically — no issues on this run.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="px-[18px] py-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]">
              Role
              <input value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] font-normal text-[var(--ink)]" />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]">
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] font-normal text-[var(--ink)]" />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]">
              Employment type
              <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] font-normal text-[var(--ink)]">
                <option>Full-time</option>
                <option>Part-time</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]">
              Weekly hours
              <input value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} inputMode="decimal" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] text-[var(--ink)]" />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]">
              Tax code
              <input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] text-[var(--ink)]" />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]">
              NI number
              <input value={niNumber} onChange={(e) => setNiNumber(e.target.value)} className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] text-[var(--ink)]" />
            </label>
          </div>
          <div className="mt-3.5 flex items-center justify-end gap-2">
            {error && <span className="mr-auto text-[12px] font-semibold text-[var(--critical-ink)]">{error}</span>}
            <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]">Cancel</button>
            <button onClick={save} disabled={submitting} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
