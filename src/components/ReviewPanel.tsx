"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import type { PayrollLine } from "@/lib/queries";

const SEV_STYLES: Record<string, { stripe: string; tagBg: string; tagInk: string }> = {
  critical: { stripe: "var(--critical)", tagBg: "var(--critical-soft)", tagInk: "var(--critical-ink)" },
  serious: { stripe: "var(--serious)", tagBg: "var(--serious-soft)", tagInk: "var(--serious-ink)" },
  warning: { stripe: "var(--warning)", tagBg: "var(--warning-soft)", tagInk: "var(--warning-ink)" },
};

function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-2.5 w-2.5">
      <path d="M12 3l9 16H3L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-2.5 w-2.5">
      <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReviewPanel({
  initialLines,
  totalEmployees,
}: {
  initialLines: PayrollLine[];
  totalEmployees: number;
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [filter, setFilter] = useState<string>("all");
  const [validatedOpen, setValidatedOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const flagged = useMemo(() => lines.filter((l) => l.severity), [lines]);
  const validated = useMemo(() => lines.filter((l) => !l.severity), [lines]);
  const openFlagged = flagged.filter((l) => !l.resolved);

  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    openFlagged.forEach((l) => {
      if (l.source) counts.set(l.source, (counts.get(l.source) ?? 0) + 1);
    });
    return counts;
  }, [openFlagged]);

  const sources = ["Bank & Payments", "Compliance", "Tax & Statutory", "Commission & Variable Pay"];
  const visibleFlagged = filter === "all" ? flagged : flagged.filter((l) => l.source === filter);

  const blocking = openFlagged.filter((l) => l.severity === "critical");
  const approvable = totalEmployees - blocking.length;

  function showToast(msg: string) {
    setToast(msg);
    window.clearTimeout((window as unknown as { __t?: number }).__t);
    (window as unknown as { __t?: number }).__t = window.setTimeout(() => setToast(null), 3800);
  }

  async function resolve(line: PayrollLine) {
    setBusyId(line.id);
    setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, resolved: 1 } : l)));
    try {
      await fetch("/api/lines/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId: line.id }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  function query(line: PayrollLine) {
    showToast(`Query sent to your payroll specialist about ${line.employee_name}.`);
  }

  async function approve() {
    setApproving(true);
    try {
      const res = await fetch("/api/runs/approve", { method: "POST" });
      const data = await res.json();
      if (data.blockingCount > 0) {
        showToast(
          `${data.includedCount} payments approved and queued. Jack Whitmore will join the next run once his bank details are confirmed.`
        );
      } else {
        showToast("Payroll approved — BACS submission and HMRC RTI filing triggered automatically.");
      }
      router.refresh();
    } finally {
      setApproving(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px] pb-[13px]">
        <div>
          <h2 className="font-display text-[16.5px] font-semibold">Needs your review</h2>
          <div className="mt-0.5 text-xs text-[var(--ink-muted)]">
            {openFlagged.length > 0
              ? `${openFlagged.length} item${openFlagged.length === 1 ? "" : "s"} flagged · the rest validated automatically`
              : "All clear — nothing left to review"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-[7px] px-[18px] pb-1 pt-[13px]">
        <button
          onClick={() => setFilter("all")}
          className={`inline-flex items-center gap-[5px] rounded-full border px-[11px] py-[5px] text-[11.8px] font-semibold ${
            filter === "all"
              ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"
          }`}
        >
          All <span className="font-num text-[var(--ink-muted)]">{flagged.length}</span>
        </button>
        {sources.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`inline-flex items-center gap-[5px] rounded-full border px-[11px] py-[5px] text-[11.8px] font-semibold ${
              filter === s
                ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"
            }`}
          >
            {s} <span className="font-num text-[var(--ink-muted)]">{sourceCounts.get(s) ?? 0}</span>
          </button>
        ))}
      </div>

      <div>
        {visibleFlagged.map((line, i) => {
          const sev = SEV_STYLES[line.severity!];
          const resolved = !!line.resolved;
          return (
            <div
              key={line.id}
              className={`grid grid-cols-[4px_1fr_auto] border-b border-[var(--border)] transition-opacity ${
                i === visibleFlagged.length - 1 ? "border-b-0" : ""
              } ${resolved ? "opacity-50" : ""}`}
            >
              <div style={{ background: sev.stripe }} />
              <div className="px-4 py-[14px]">
                <div className="mb-[7px] flex flex-wrap items-center gap-1.5">
                  <div
                    className="inline-flex items-center gap-[5px] rounded-[6px] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                    style={{ background: sev.tagBg, color: sev.tagInk }}
                  >
                    {line.severity === "warning" ? <InfoIcon /> : <WarnIcon />}
                    {line.tag_label}
                  </div>
                  <span className="inline-flex items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-[7px] py-0.5 text-[10.5px] font-semibold text-[var(--ink-secondary)]">
                    {line.source}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13.8px] font-bold">{line.employee_name}</span>
                    <span className="text-xs text-[var(--ink-muted)]">{line.role}</span>
                  </div>
                  <div className="whitespace-nowrap text-[13.8px] font-semibold font-num">
                    {gbp(line.net_pay)}
                    {line.delta_pct != null && (
                      <span className="ml-1.5 text-[11.5px] font-semibold text-[var(--critical-ink)]">
                        {line.delta_pct}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="max-w-[62ch] text-[13px] text-[var(--ink-secondary)]">{line.reason}</div>
              </div>
              {resolved ? (
                <div className="flex items-center gap-1.5 px-4 py-[14px] text-[12.5px] font-bold text-[var(--good-ink)]">
                  <CheckIcon className="h-[15px] w-[15px]" />
                  Resolved
                </div>
              ) : (
                <div className="flex items-start gap-2 px-4 py-[14px]">
                  <button
                    disabled={busyId === line.id}
                    onClick={() => resolve(line)}
                    className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-[13px] py-2 text-[12.5px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
                  >
                    {line.severity === "critical" ? "I've updated their details" : "Approve"}
                  </button>
                  <button
                    onClick={() => query(line)}
                    className="rounded-lg px-[10px] py-2 text-[12px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]"
                  >
                    Query
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div
          onClick={() => setValidatedOpen((v) => !v)}
          className="flex cursor-pointer items-center justify-between gap-3 bg-[var(--good-soft)] px-4 py-[14px]"
        >
          <div className="flex items-center gap-2.5">
            <CheckIcon className="h-4 w-4 flex-none text-[var(--good-ink)]" />
            <div className="text-[13.5px] font-semibold text-[var(--good-ink)]">
              {validated.length} employees · validated automatically
              <small className="mt-px block text-[11.8px] font-medium text-[var(--ink-secondary)]">
                No variance, tax code changes or NMW risk detected
              </small>
            </div>
          </div>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className={`h-3.5 w-3.5 flex-none text-[var(--ink-muted)] transition-transform ${validatedOpen ? "rotate-180" : ""}`}
          >
            <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {validatedOpen && (
          <div className="border-t border-[var(--border)]">
            {validated.map((l, i) => (
              <div
                key={l.id}
                className={`flex items-center justify-between px-4 py-[9px] text-[12.8px] ${
                  i < validated.length - 1 ? "border-b border-[var(--border)]" : ""
                }`}
              >
                <span>
                  <span className="font-semibold">{l.employee_name}</span>
                  <span className="ml-1.5 text-[var(--ink-muted)]">{l.role}</span>
                </span>
                <span className="font-num text-[var(--ink-secondary)]">{gbp(l.net_pay)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-[var(--border)] bg-[var(--surface-2)] px-[18px] py-[14px]">
        <div className="max-w-[46ch] text-xs text-[var(--ink-secondary)]">
          {blocking.length > 0 ? (
            <>
              <strong className="text-[var(--ink)]">1 item</strong> is blocking this run — resolve Jack Whitmore&rsquo;s bank
              details, or approve the other {approvable} now.
            </>
          ) : (
            "Every item has been reviewed. Approving will submit the BACS file and file RTI with HMRC on payday."
          )}
        </div>
        <button
          onClick={approve}
          disabled={approving}
          className="rounded-lg bg-[var(--accent)] px-[13px] py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          {blocking.length > 0 ? `Approve ${approvable} of ${totalEmployees}` : `Approve all ${totalEmployees}`}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-[26px] left-1/2 z-20 max-w-[420px] -translate-x-1/2 rounded-[11px] bg-[var(--ink)] px-[18px] py-[13px] text-[13px] font-medium text-[var(--bg)] shadow-[0_14px_34px_-10px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-2.5">
            <CheckIcon className="h-[17px] w-[17px] flex-none text-[var(--good)]" />
            {toast}
          </div>
        </div>
      )}
    </section>
  );
}
