type AuditEntry = { id: string; kind: string; message: string; detail: string; occurred_at: string };

export function AuditList({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="flex flex-col">
      {entries.map((e, i) => (
        <div
          key={e.id}
          className={`flex gap-2.5 py-2.5 ${i < entries.length - 1 ? "border-b border-dashed border-[var(--border)]" : ""}`}
        >
          <div
            className="mt-[5px] h-[7px] w-[7px] flex-none rounded-full"
            style={{ background: e.kind === "approval" ? "var(--good)" : "var(--accent)" }}
          />
          <div className="text-[12.3px] text-[var(--ink-secondary)]">
            <strong className="font-semibold text-[var(--ink)]">{e.message}</strong>
            {" · "}
            {e.detail}
            <span className="mt-0.5 block text-[11px] text-[var(--ink-muted)]">{e.occurred_at}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
