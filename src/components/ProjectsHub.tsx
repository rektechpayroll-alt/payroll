"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import { StatRow, StatTile } from "@/components/StatTile";
import type { Project, ProjectTimeEntry, Employee } from "@/lib/queries";
import { summarizeProject } from "@/lib/projects";

const STATUS_STYLES: Record<string, { bg: string; ink: string; label: string }> = {
  active: { bg: "var(--accent-soft)", ink: "var(--accent-strong)", label: "Active" },
  completed: { bg: "var(--good-soft)", ink: "var(--good-ink)", label: "Completed" },
  on_hold: { bg: "var(--surface-2)", ink: "var(--ink-muted)", label: "On hold" },
};

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className ?? "h-3.5 w-3.5"}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

type ProjectWithEntries = Project & { entries: ProjectTimeEntry[] };

export function ProjectsHub({ employees, initialProjects }: { employees: Employee[]; initialProjects: ProjectWithEntries[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openTimeForm, setOpenTimeForm] = useState<string | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);

  async function setStatus(id: string, status: Project["status"]) {
    setBusyId(id);
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      await fetch("/api/projects/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function logTime(projectId: string, employeeId: string, hours: number, note: string) {
    setBusyId(projectId);
    try {
      const res = await fetch("/api/projects/log-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, employeeId, hours, note: note || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, entries: [data.entry, ...p.entries] } : p)));
        setOpenTimeForm(null);
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = projects.filter((p) => p.status === "active").length;
  const overBudgetCount = projects.filter((p) => summarizeProject(p, p.entries).isOverBudget).length;

  return (
    <div>
      <StatRow>
        <StatTile label="Active projects" value={String(activeCount)} meta={<span>{projects.length} tracked in total</span>} />
        <StatTile
          label="Over budget"
          value={String(overBudgetCount)}
          meta={<span>hours logged &times; hourly rate vs budget</span>}
          pill={overBudgetCount > 0 ? { tone: "warn", icon: <PlusIcon className="h-2.5 w-2.5" />, text: "Needs review" } : { tone: "good", icon: <PlusIcon className="h-2.5 w-2.5" />, text: "On track" }}
        />
      </StatRow>

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px]">
          <div>
            <h2 className="font-display text-[16.5px] font-semibold">Client projects</h2>
            <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Time logged against each project converts to cost at its hourly rate</div>
          </div>
          <button onClick={() => setProjectFormOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]">
            <PlusIcon />
            New project
          </button>
        </div>

        {projectFormOpen && (
          <NewProjectForm
            onCreated={(project) => {
              setProjects((prev) => [...prev, { ...project, entries: [] }]);
              setProjectFormOpen(false);
              router.refresh();
            }}
            onCancel={() => setProjectFormOpen(false)}
          />
        )}

        <div>
          {projects.map((p, i) => {
            const summary = summarizeProject(p, p.entries);
            const s = STATUS_STYLES[p.status];
            const pct = Math.min(100, Math.max(0, summary.percentUsed));
            return (
              <div key={p.id} className={`px-[18px] py-[14px] ${i === projects.length - 1 ? "" : "border-b border-[var(--border)]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-bold">{p.name}</span>
                      <span className="rounded-[6px] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ background: s.bg, color: s.ink }}>{s.label}</span>
                      {summary.isOverBudget && (
                        <span className="rounded-[6px] bg-[var(--critical-soft)] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--critical-ink)]">Over budget</span>
                      )}
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--ink-muted)]">{p.client_name} &middot; started {p.start_date} &middot; {gbp(p.hourly_rate)}/hr</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setOpenTimeForm(openTimeForm === p.id ? null : p.id)} className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--surface-2)]">
                      Log time
                    </button>
                    {p.status === "active" && (
                      <button disabled={busyId === p.id} onClick={() => setStatus(p.id, "completed")} className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)] disabled:opacity-50">Mark completed</button>
                    )}
                  </div>
                </div>

                <div className="mt-2.5">
                  <div className="h-[6px] overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: summary.isOverBudget ? "var(--critical)" : "var(--accent)" }}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-[var(--ink-muted)]">
                    <span className="font-num">{summary.hoursLogged}h logged</span>
                    <span className="font-num">{gbp(summary.costToDate)} of {gbp(p.budget)}</span>
                    <span className="font-num">{summary.percentUsed.toFixed(0)}% used</span>
                  </div>
                </div>

                {openTimeForm === p.id && (
                  <LogTimeForm employees={employees} busy={busyId === p.id} onSubmit={(employeeId, hours, note) => logTime(p.id, employeeId, hours, note)} />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function LogTimeForm({ employees, busy, onSubmit }: { employees: Employee[]; busy: boolean; onSubmit: (employeeId: string, hours: number, note: string) => void }) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_90px_1fr_auto]">
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)]">
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Hours" inputMode="decimal" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)]" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)]" />
        <button
          disabled={busy || !(Number(hours) > 0)}
          onClick={() => onSubmit(employeeId, Number(hours), note)}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          Log
        </button>
      </div>
    </div>
  );
}

function NewProjectForm({ onCreated, onCancel }: { onCreated: (project: Project) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim() || !clientName.trim()) return setError("Name and client are required.");
    if (!(Number(budget) > 0)) return setError("Budget must be positive.");
    if (!startDate.trim()) return setError("Start date is required.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, clientName, budget: Number(budget), startDate }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      onCreated(data.project as Project);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-[18px] py-[16px]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Budget £" inputMode="decimal" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Start date, e.g. 1 Oct 2026" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
      </div>
      <div className="mt-3.5 flex items-center justify-end gap-2">
        {error && <span className="mr-auto text-[12px] font-semibold text-[var(--critical-ink)]">{error}</span>}
        <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface)]">Cancel</button>
        <button onClick={submit} disabled={submitting} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
          {submitting ? "Creating…" : "Create project"}
        </button>
      </div>
    </div>
  );
}
