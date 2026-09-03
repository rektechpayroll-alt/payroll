import { ReactNode } from "react";

export function StatTile({
  label,
  value,
  meta,
  pill,
}: {
  label: string;
  value: string;
  meta?: ReactNode;
  pill?: { tone: "good" | "warn"; icon: ReactNode; text: string };
}) {
  const pillClasses =
    pill?.tone === "warn"
      ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]"
      : "bg-[var(--good-soft)] text-[var(--good-ink)]";

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 px-[18px] shadow-[var(--shadow)]">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
        {label}
      </div>
      <div className="font-display font-num mt-1.5 text-[27px] font-semibold">{value}</div>
      {meta && <div className="mt-2 flex flex-col gap-[3px] text-xs text-[var(--ink-secondary)]">{meta}</div>}
      {pill && (
        <div
          className={`mt-2.5 inline-flex items-center gap-[5px] rounded-full py-[3px] pl-[7px] pr-[9px] text-xs font-semibold ${pillClasses}`}
        >
          {pill.icon}
          {pill.text}
        </div>
      )}
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="mb-[22px] grid grid-cols-1 gap-3.5 sm:grid-cols-3">{children}</div>;
}

export function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="font-num">{value}</span>
    </div>
  );
}
