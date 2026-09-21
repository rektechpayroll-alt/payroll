"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { GradientAnnouncementBar } from "./GradientAnnouncementBar";

const LINKS = [
  { href: "/product", label: "Product" },
  { href: "/compare", label: "Compare" },
  { href: "/pricing", label: "Pricing" },
];

type FeatureLink = { href: string; name: string; description: string };

const POPULAR_FEATURES: FeatureLink[] = [
  { href: "/dashboard", name: "Payroll", description: "Exception-first approval, run diffs and full statutory coverage." },
  { href: "/dashboard/ledger", name: "Verity Ledger", description: "Quotes, invoices, card & bank payment, reconciliation." },
  { href: "/dashboard/purchasing", name: "Purchasing", description: "Bills and purchase orders, paid straight from the ledger." },
  { href: "/dashboard/agents", name: "AI Agents", description: "Compliance, Reconciliation and Close, working your real data." },
];

const MORE_FEATURES: FeatureLink[] = [
  { href: "/dashboard/inventory", name: "Inventory", description: "Signage, merchandise and equipment stock." },
  { href: "/dashboard/expenses", name: "Expenses & Mileage", description: "Claims, approval and reimbursement." },
  { href: "/dashboard/projects", name: "Projects", description: "Time logged against budget, per client." },
  { href: "/dashboard/runs/diff", name: "Run diff", description: "A git-style diff between payroll runs." },
  { href: "/dashboard/simulator", name: "Simulator", description: "What-if payroll planning." },
];

function FeatureLinkRow({ feature, onClick }: { feature: FeatureLink; onClick: () => void }) {
  return (
    <Link href={feature.href} onClick={onClick} className="block rounded-lg px-2.5 py-2 hover:bg-black/[0.04]">
      <div className="text-[13.5px] font-bold text-[var(--mkt-card-ink)]">{feature.name}</div>
      <div className="mt-0.5 text-[12px] leading-snug text-[var(--mkt-card-ink-secondary)]">{feature.description}</div>
    </Link>
  );
}

export function MarketingHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30">
      <GradientAnnouncementBar />
      <div className="border-b border-[var(--mkt-border)] bg-black/90 backdrop-blur">
        <div className="mx-auto flex h-[64px] max-w-[1180px] items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-[9px]" onClick={() => setOpen(false)}>
            <div className="mkt-grad-bar flex h-[28px] w-[28px] flex-none items-center justify-center rounded-[7px]">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M5 12.5L10 17L19 7" stroke="#0a0f0a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[18px] font-bold tracking-tight text-white">Verity</span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            <div className="relative">
              <button
                type="button"
                onClick={() => setFeaturesOpen((v) => !v)}
                className={`mkt-pill inline-flex items-center gap-1.5 px-3.5 py-2 text-[13.5px] font-medium ${
                  featuresOpen ? "bg-white/10 text-white" : "text-white/70 hover:text-white"
                }`}
              >
                Features
                <svg viewBox="0 0 24 24" fill="none" className={`h-3 w-3 transition-transform ${featuresOpen ? "rotate-180" : ""}`}>
                  <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {featuresOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setFeaturesOpen(false)} />
                  <div className="absolute left-1/2 top-[calc(100%+14px)] z-40 w-[560px] -translate-x-1/2 rounded-2xl border border-[var(--mkt-border)] bg-[var(--mkt-card-bg)] p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <div className="mb-1.5 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--mkt-card-ink-secondary)]">Popular features</div>
                        {POPULAR_FEATURES.map((f) => (
                          <FeatureLinkRow key={f.href} feature={f} onClick={() => setFeaturesOpen(false)} />
                        ))}
                      </div>
                      <div>
                        <div className="mb-1.5 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--mkt-card-ink-secondary)]">More features</div>
                        {MORE_FEATURES.map((f) => (
                          <FeatureLinkRow key={f.href} feature={f} onClick={() => setFeaturesOpen(false)} />
                        ))}
                        <Link
                          href="/product"
                          onClick={() => setFeaturesOpen(false)}
                          className="mt-1 block px-2.5 text-[12.5px] font-bold text-[var(--mkt-card-ink)] underline decoration-[var(--mkt-card-ink-secondary)] underline-offset-2"
                        >
                          View all features &rarr;
                        </Link>
                      </div>
                    </div>
                    <div className="mkt-grad-bar mt-5 rounded-xl p-4">
                      <div className="text-[13.5px] font-bold text-[#0a0f0a]">Built to scale</div>
                      <p className="mt-1 text-[12px] leading-snug text-[#0a0f0a]/75">
                        Multi-entity consolidation, role-based approval chains and enterprise SSO for 1,000+ employee groups.
                      </p>
                      <Link href="/pricing" onClick={() => setFeaturesOpen(false)} className="mt-2.5 inline-block rounded-lg bg-black px-3 py-1.5 text-[12px] font-semibold text-white">
                        See Enterprise pricing
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>

            {LINKS.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`mkt-pill px-3.5 py-2 text-[13.5px] font-medium ${
                    active ? "bg-white/10 text-white" : "text-white/70 hover:text-white"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2.5 sm:flex">
            <Link href="/dashboard" className="mkt-pill px-3.5 py-[9px] text-[13px] font-semibold text-white/80 hover:text-white">
              View live demo
            </Link>
            <Link
              href="/pricing"
              className="mkt-pill bg-white px-4 py-[9px] text-[13px] font-semibold text-black hover:bg-white/90"
            >
              Get started
            </Link>
          </div>

          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="mkt-pill flex h-9 w-9 items-center justify-center border border-white/20 text-white sm:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>

        {open && (
          <div className="border-t border-[var(--mkt-border)] bg-black px-5 py-3 sm:hidden">
            <nav className="flex flex-col gap-0.5">
              <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wider text-white/40">Features</div>
              {[...POPULAR_FEATURES, ...MORE_FEATURES].map((f) => (
                <Link
                  key={f.href}
                  href={f.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-white/70 hover:bg-white/5 hover:text-white"
                >
                  {f.name}
                </Link>
              ))}
              <div className="mt-1.5 border-t border-[var(--mkt-border)] pt-2" />
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2.5 py-2.5 text-[14px] font-medium text-white/70 hover:bg-white/5 hover:text-white"
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="mkt-pill mt-2 border border-white/20 px-2.5 py-2.5 text-center text-[14px] font-semibold text-white"
              >
                View live demo
              </Link>
              <Link
                href="/pricing"
                onClick={() => setOpen(false)}
                className="mkt-pill mt-1.5 bg-white px-2.5 py-2.5 text-center text-[14px] font-semibold text-black"
              >
                Get started
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
