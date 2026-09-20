"use client";

import { useMemo, useState } from "react";
import { gbp } from "@/lib/format";
import { StatRow, StatTile } from "@/components/StatTile";
import type { DiffLine, DiffSummary } from "@/lib/rundiff";

const SEV_STYLES: Record<string, { tagBg: string; tagInk: string }> = {
  critical: { tagBg: "var(--critical-soft)", tagInk: "var(--critical-ink)" },
  serious: { tagBg: "var(--serious-soft)", tagInk: "var(--serious-ink)" },
  warning: { tagBg: "var(--warning-soft)", tagInk: "var(--warning-ink)" },
};

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3 flex-none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3 flex-none">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
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

function formatDelta(delta: number, pct: number | null): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const amount = gbp(Math.abs(delta));
  const pctStr = pct != null ? ` (${sign}${Math.abs(pct).toFixed(1)}%)` : "";
  return `${sign}${amount}${pctStr}`;
}

function DeltaBadge({ delta, pct }: { delta: number; pct: number | null }) {
  if (Math.abs(delta) < 0.005) {
    return <span className="font-num text-[12.5px] font-semibold text-[var(--ink-muted)]">No change</span>;
  }
  const positive = delta > 0;
  return (
    <span
      className="font-num text-[12.5px] font-bold"
      style={{ color: positive ? "var(--good-ink)" : "var(--critical-ink)" }}
    >
      {formatDelta(delta, pct)}
    </span>
  );
}

export function RunDiffView({
  lines,
  summary,
  currentPeriodLabel,
  previousPeriodLabel,
}: {
  lines: DiffLine[];
  summary: DiffSummary;
  currentPeriodLabel: string;
  previousPeriodLabel: string;
}) {
  const [changedOnly, setChangedOnly] = useState(true);

  const visible = useMemo(
    () => (changedOnly ? lines.filter((l) => l.status !== "unchanged") : lines),
    [lines, changedOnly]
  );

  return (
    <div>
      <StatRow>
        <StatTile
          label="Net pay, workforce-wide"
          value={formatDelta(summary.netDelta, null)}
          meta={<span>{previousPeriodLabel} → {currentPeriodLabel}</span>}
        />
        <StatTile
          label="Starters / leavers"
          value={`${summary.starters} / ${summary.leavers}`}
          meta={<span>{summary.payChanged} of {lines.length} on payroll had a pay change</span>}
        />
        <StatTile
          label="Compliance flags"
          value={`${summary.flagsAppeared} new`}
          meta={<span>{summary.flagsResolved} resolved since last run</span>}
          pill={
            summary.flagsAppeared > 0
              ? { tone: "warn", icon: <PlusIcon />, text: "Needs a look" }
              : { tone: "good", icon: <CheckIcon className="h-2.5 w-2.5" />, text: "Nothing new" }
          }
        />
      </StatRow>

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px]">
          <div>
            <h2 className="font-display text-[16.5px] font-semibold">Employee-by-employee diff</h2>
            <div className="mt-0.5 text-xs text-[var(--ink-muted)]">
              {visible.length} of {lines.length} employees shown
            </div>
          </div>
          <div className="flex gap-[7px]">
            <button
              onClick={() => setChangedOnly(true)}
              className={`rounded-full border px-[11px] py-[5px] text-[11.8px] font-semibold ${
                changedOnly
                  ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"
              }`}
            >
              Changed only
            </button>
            <button
              onClick={() => setChangedOnly(false)}
              className={`rounded-full border px-[11px] py-[5px] text-[11.8px] font-semibold ${
                !changedOnly
                  ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"
              }`}
            >
              Show all {lines.length}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="flex items-center gap-2.5 px-[18px] py-[18px] text-[13.5px] font-semibold text-[var(--good-ink)]">
            <CheckIcon className="h-4 w-4 flex-none" />
            Nothing changed between these two runs.
          </div>
        ) : (
          <div>
            {visible.map((line, i) => (
              <DiffRow key={line.employee_id ?? line.employee_name} line={line} isLast={i === visible.length - 1} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DiffRow({ line, isLast }: { line: DiffLine; isLast: boolean }) {
  const border = isLast ? "" : "border-b border-[var(--border)]";

  if (line.status === "new") {
    return (
      <div className={`flex flex-wrap items-center justify-between gap-3 px-[18px] py-[13px] ${border}`} style={{ background: "var(--good-soft)" }}>
        <div className="flex items-center gap-2">
          <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[var(--good-ink)]"><PlusIcon /></span>
          <span className="text-[13.5px] font-bold text-[var(--good-ink)]">{line.employee_name}</span>
          <span className="text-xs text-[var(--ink-muted)]">{line.role}</span>
          <span className="rounded-[6px] bg-[var(--good-soft)] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--good-ink)]">
            New starter
          </span>
        </div>
        <span className="font-num text-[13.5px] font-semibold text-[var(--good-ink)]">{gbp(line.current_net!)}</span>
      </div>
    );
  }

  if (line.status === "left") {
    return (
      <div className={`flex flex-wrap items-center justify-between gap-3 px-[18px] py-[13px] ${border}`} style={{ background: "var(--critical-soft)" }}>
        <div className="flex items-center gap-2">
          <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[var(--critical-ink)]"><MinusIcon /></span>
          <span className="text-[13.5px] font-bold text-[var(--critical-ink)] line-through">{line.employee_name}</span>
          <span className="text-xs text-[var(--ink-muted)]">{line.role}</span>
          <span className="rounded-[6px] bg-[var(--critical-soft)] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--critical-ink)]">
            Left payroll
          </span>
        </div>
        <span className="font-num text-[13.5px] font-semibold text-[var(--critical-ink)] line-through">{gbp(line.previous_net!)}</span>
      </div>
    );
  }

  const flagSev = line.flagChange === "appeared" ? line.current_severity : null;
  const sevStyle = flagSev ? SEV_STYLES[flagSev] : null;

  return (
    <div className={`px-[18px] py-[13px] ${border} ${line.status === "unchanged" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[13.5px] font-bold">{line.employee_name}</span>
          <span className="text-xs text-[var(--ink-muted)]">{line.role}</span>
          {line.flagChange === "appeared" && sevStyle && (
            <span
              className="rounded-[6px] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
              style={{ background: sevStyle.tagBg, color: sevStyle.tagInk }}
            >
              New: {line.current_tag}
            </span>
          )}
          {line.flagChange === "resolved" && (
            <span className="rounded-[6px] bg-[var(--good-soft)] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--good-ink)]">
              Resolved since last run
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-num text-[12.5px] text-[var(--ink-muted)]">
            {gbp(line.previous_net!)} <span className="mx-1">&rarr;</span> {gbp(line.current_net!)}
          </span>
          <DeltaBadge delta={line.delta ?? 0} pct={line.deltaPct} />
        </div>
      </div>
      {line.flagChange === "appeared" && line.current_reason && (
        <div className="mt-1.5 max-w-[62ch] text-[13px] text-[var(--ink-secondary)]">{line.current_reason}</div>
      )}
    </div>
  );
}
