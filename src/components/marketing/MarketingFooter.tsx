import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--mkt-border)] bg-black">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-[320px]">
          <div className="flex items-center gap-[9px]">
            <div className="mkt-grad-bar flex h-[24px] w-[24px] flex-none items-center justify-center rounded-[6px]">
              <svg viewBox="0 0 24 24" fill="none" className="h-[13px] w-[13px]">
                <path d="M5 12.5L10 17L19 7" stroke="#0a0f0a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[16px] font-bold tracking-tight text-white">Verity</span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-white/50">
            AI-powered payroll, compliance and HR software — for every stage of business, from first hire to 1,000+ employees.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Product</div>
            <div className="mt-2.5 flex flex-col gap-2 text-[13.5px]">
              <Link href="/product" className="text-white/65 hover:text-white">How it works</Link>
              <Link href="/compare" className="text-white/65 hover:text-white">Compare</Link>
              <Link href="/pricing" className="text-white/65 hover:text-white">Pricing</Link>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Demo</div>
            <div className="mt-2.5 flex flex-col gap-2 text-[13.5px]">
              <Link href="/dashboard" className="text-white/65 hover:text-white">Approval dashboard</Link>
              <Link href="/dashboard/agents" className="text-white/65 hover:text-white">AI agents</Link>
              <Link href="/dashboard/profitability" className="text-white/65 hover:text-white">Profitability index</Link>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Company</div>
            <div className="mt-2.5 flex flex-col gap-2 text-[13.5px] text-white/65">
              <span>Verity Payroll Ltd</span>
              <span className="text-white/40">United Kingdom</span>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--mkt-border)] py-4">
        <p className="mx-auto max-w-[1180px] px-5 text-[12px] text-white/40">
          © {new Date().getFullYear()} Verity Payroll Ltd. Early-stage product preview — figures on this site are illustrative.
        </p>
      </div>
    </footer>
  );
}
