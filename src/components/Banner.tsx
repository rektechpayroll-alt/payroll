export function Banner({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-[18px] flex items-start gap-3 rounded-xl bg-[var(--accent-soft)] p-[13px] px-4">
      <svg viewBox="0 0 24 24" fill="none" className="mt-px h-[18px] w-[18px] flex-none text-[var(--accent-strong)]">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8.2 12.3l2.6 2.6 5-5.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <div className="text-[13.3px] font-bold text-[var(--ink)]">{title}</div>
        <div className="mt-0.5 max-w-[68ch] text-[12.6px] text-[var(--ink-secondary)]">{text}</div>
      </div>
    </div>
  );
}
