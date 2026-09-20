"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import type { PayrollLine, CloseTask } from "@/lib/queries";
import type { ComplianceException } from "@/lib/compliance";
import { AGENTS } from "@/lib/agents";

const SEV_STYLES: Record<string, { tagBg: string; tagInk: string }> = {
  critical: { tagBg: "var(--critical-soft)", tagInk: "var(--critical-ink)" },
  serious: { tagBg: "var(--serious-soft)", tagInk: "var(--serious-ink)" },
  warning: { tagBg: "var(--warning-soft)", tagInk: "var(--warning-ink)" },
};

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AgentsHub({
  complianceExceptions,
  flaggedLines,
  closeTasks,
}: {
  complianceExceptions: ComplianceException[];
  flaggedLines: PayrollLine[];
  closeTasks: CloseTask[];
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string>("compliance");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tasks, setTasks] = useState(closeTasks);

  const grouped = useMemo(() => {
    const map = new Map<string, PayrollLine[]>();
    flaggedLines.forEach((l) => {
      const key = l.source ?? "Other";
      map.set(key, [...(map.get(key) ?? []), l]);
    });
    return map;
  }, [flaggedLines]);

  async function resolveLine(lineId: string) {
    setBusyId(lineId);
    try {
      await fetch("/api/lines/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleTask(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: t.done ? 0 : 1 } : t)));
    try {
      await fetch("/api/close-tasks/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      router.refresh();
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: t.done ? 0 : 1 } : t)));
    }
  }

  const outstanding = tasks.filter((t) => !t.done).length;

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] p-2.5">
        {AGENTS.map((a) => {
          const count =
            a.id === "compliance" ? complianceExceptions.length : a.id === "reconciliation" ? flaggedLines.length : outstanding;
          return (
            <button
              key={a.id}
              onClick={() => setActiveId(a.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[13px] font-semibold ${
                activeId === a.id
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {a.name}
              <span
                className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-bold ${
                  count > 0 ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "bg-[var(--good-soft)] text-[var(--good-ink)]"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-[18px]">
        {activeId === "compliance" && (
          <div>
            <p className="mb-4 max-w-[64ch] text-[13px] text-[var(--ink-secondary)]">
              {AGENTS[0].description}
            </p>
            {complianceExceptions.length === 0 ? (
              <EmptyState text="No NMW or statutory-leave exceptions across the workforce." />
            ) : (
              <div className="flex flex-col gap-2.5">
                {complianceExceptions.map((e, i) => (
                  <div
                    key={`${e.employeeId}-${e.kind}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[11px] border border-[var(--border)] px-4 py-3"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13.5px] font-bold">{e.employeeName}</span>
                        <span
                          className="rounded-[6px] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                          style={{
                            background: (e.kind === "nmw" ? SEV_STYLES.critical : SEV_STYLES.warning).tagBg,
                            color: (e.kind === "nmw" ? SEV_STYLES.critical : SEV_STYLES.warning).tagInk,
                          }}
                        >
                          {e.kind === "nmw" ? "NMW" : "Statutory leave"}
                        </span>
                      </div>
                      <p className="mt-1 max-w-[56ch] text-[13px] text-[var(--ink-secondary)]">{e.detail}</p>
                    </div>
                    <Link
                      href={`/dashboard/employees/${e.employeeId}`}
                      className="flex-none rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[12.5px] font-semibold hover:bg-[var(--surface-2)]"
                    >
                      View employee
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeId === "reconciliation" && (
          <div>
            <p className="mb-4 max-w-[64ch] text-[13px] text-[var(--ink-secondary)]">{AGENTS[1].description}</p>
            {flaggedLines.length === 0 ? (
              <EmptyState text="No variance flagged on the current run." />
            ) : (
              <div className="flex flex-col gap-5">
                {Array.from(grouped.entries()).map(([source, lines]) => (
                  <div key={source}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                      {source} · {lines.length}
                    </div>
                    <div className="mt-2 flex flex-col gap-2">
                      {lines.map((l) => {
                        const sev = SEV_STYLES[l.severity ?? "warning"];
                        const resolved = !!l.resolved;
                        return (
                          <div
                            key={l.id}
                            className={`flex flex-wrap items-center justify-between gap-3 rounded-[11px] border border-[var(--border)] px-4 py-3 ${resolved ? "opacity-50" : ""}`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[13.5px] font-bold">{l.employee_name}</span>
                                <span
                                  className="rounded-[6px] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                                  style={{ background: sev.tagBg, color: sev.tagInk }}
                                >
                                  {l.tag_label}
                                </span>
                              </div>
                              <p className="mt-1 max-w-[56ch] text-[13px] text-[var(--ink-secondary)]">{l.reason}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-num text-[13.5px] font-semibold">{gbp(l.net_pay)}</span>
                              {resolved ? (
                                <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[var(--good-ink)]">
                                  <CheckIcon className="h-4 w-4" /> Resolved
                                </span>
                              ) : (
                                <button
                                  disabled={busyId === l.id}
                                  onClick={() => resolveLine(l.id)}
                                  className="rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[12.5px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
                                >
                                  Resolve
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeId === "close" && (
          <div>
            <p className="mb-4 max-w-[64ch] text-[13px] text-[var(--ink-secondary)]">{AGENTS[2].description}</p>
            <div className="flex flex-col gap-2">
              {tasks.map((t) => (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-center gap-3 rounded-[11px] border border-[var(--border)] px-4 py-3 hover:bg-[var(--surface-2)]"
                >
                  <input
                    type="checkbox"
                    checked={!!t.done}
                    onChange={() => toggleTask(t.id)}
                    className="h-4 w-4 flex-none accent-[var(--accent)]"
                  />
                  <span className={`text-[13.5px] ${t.done ? "text-[var(--ink-muted)] line-through" : "font-medium"}`}>{t.label}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 text-[12.5px] text-[var(--ink-secondary)]">
              {outstanding === 0 ? "Every close task is complete." : `${outstanding} task${outstanding === 1 ? "" : "s"} outstanding before this run can be signed off.`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[11px] bg-[var(--good-soft)] px-4 py-3.5 text-[13.5px] font-semibold text-[var(--good-ink)]">
      <CheckIcon className="h-4 w-4 flex-none" />
      {text}
    </div>
  );
}
