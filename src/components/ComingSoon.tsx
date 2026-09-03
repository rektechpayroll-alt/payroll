export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h1 className="font-display text-[26px] font-semibold">{title}</h1>
      <div className="mt-6 rounded-[14px] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center">
        <div className="font-display text-[15px] font-semibold text-[var(--ink)]">Not built yet</div>
        <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] text-[var(--ink-secondary)]">{note}</p>
      </div>
    </div>
  );
}
