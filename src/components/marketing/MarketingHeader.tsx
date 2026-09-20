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

export function MarketingHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
