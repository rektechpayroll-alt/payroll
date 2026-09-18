import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--border)]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-[320px]">
          <div className="flex items-center gap-[9px]">
            <div className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-[6px] bg-[var(--accent)]">
              <svg viewBox="0 0 24 24" fill="none" className="h-[13px] w-[13px]">
                <path d="M5 12.5L10 17L19 7" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="font-display text-[16px] font-semibold tracking-tight">Verity</span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-muted)]">
            UK payroll that catches problems before payday — not after, from first hire to 1,000+ employees.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Product</div>
            <div className="mt-2.5 flex flex-col gap-2 text-[13.5px]">
              <Link href="/product" className="text-[var(--ink-secondary)] hover:text-[var(--ink)]">How it works</Link>
              <Link href="/compare" className="text-[var(--ink-secondary)] hover:text-[var(--ink)]">Compare</Link>
              <Link href="/pricing" className="text-[var(--ink-secondary)] hover:text-[var(--ink)]">Pricing</Link>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Demo</div>
            <div className="mt-2.5 flex flex-col gap-2 text-[13.5px]">
              <Link href="/dashboard" className="text-[var(--ink-secondary)] hover:text-[var(--ink)]">Approval dashboard</Link>
              <Link href="/dashboard/profitability" className="text-[var(--ink-secondary)] hover:text-[var(--ink)]">Profitability index</Link>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Company</div>
            <div className="mt-2.5 flex flex-col gap-2 text-[13.5px] text-[var(--ink-secondary)]">
              <span>Verity Payroll Ltd</span>
              <span className="text-[var(--ink-muted)]">United Kingdom</span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--border)] py-4">
        <p className="mx-auto max-w-[1120px] px-5 text-[12px] text-[var(--ink-muted)]">
          © {new Date().getFullYear()} Verity Payroll Ltd. Early-stage product preview — figures on this site are illustrative.
        </p>
      </div>
    </footer>
  );
}
