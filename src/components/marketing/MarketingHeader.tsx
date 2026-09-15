"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/product", label: "Product" },
  { href: "/compare", label: "Compare" },
  { href: "/pricing", label: "Pricing" },
];

export function MarketingHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
      <div className="mx-auto flex h-[64px] max-w-[1120px] items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-[9px]" onClick={() => setOpen(false)}>
          <div className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-[7px] bg-[var(--accent)]">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M5 12.5L10 17L19 7" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-display text-[18px] font-semibold tracking-tight">Verity</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-2 text-[13.5px] font-medium ${
                  active ? "text-[var(--ink)]" : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <Link
            href="/dashboard"
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-[9px] text-[13px] font-semibold text-[var(--ink)] hover:border-[var(--accent)]"
          >
            View live demo
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg bg-[var(--accent)] px-3.5 py-[9px] text-[13px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
          >
            Get started
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] sm:hidden"
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
        <div className="border-t border-[var(--border)] bg-[var(--bg)] px-5 py-3 sm:hidden">
          <nav className="flex flex-col gap-0.5">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2.5 py-2.5 text-[14px] font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-2.5 text-center text-[14px] font-semibold text-[var(--ink)]"
            >
              View live demo
            </Link>
            <Link
              href="/pricing"
              onClick={() => setOpen(false)}
              className="mt-1.5 rounded-lg bg-[var(--accent)] px-2.5 py-2.5 text-center text-[14px] font-semibold text-[var(--accent-ink)]"
            >
              Get started
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
