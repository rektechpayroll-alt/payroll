import Link from "next/link";

export function EmptyState({
  title,
  heading,
  note,
  actions = [],
}: {
  title: string;
  heading: string;
  note: string;
  actions?: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold">{title}</h1>
      <div className="mt-6 rounded-[14px] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center">
        <div className="font-display text-[15px] font-semibold text-[var(--ink)]">{heading}</div>
        <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-[var(--ink-secondary)]">{note}</p>
        {actions.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {actions.map((a, i) => (
              <Link
                key={a.href}
                href={a.href}
                className={
                  i === 0
                    ? "rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
                    : "rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2 text-[12.5px] font-semibold hover:bg-[var(--surface-2)]"
                }
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
