"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Membership } from "@/lib/tenant";

export async function switchBusiness(companyId: string) {
  const res = await fetch("/api/companies/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId }),
  });
  if (!res.ok) throw new Error("Couldn't open that business");
  // Full navigation so every server component re-reads the new active business.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load makes every server component re-read the active business
  window.location.href = "/dashboard";
}

export function BusinessSwitcher({
  activeId,
  activeName,
  activeMeta,
  memberships,
  isAdmin,
  viewingAsAdmin,
}: {
  activeId: string;
  activeName: string;
  activeMeta: string;
  memberships: Membership[];
  isAdmin: boolean;
  viewingAsAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function pick(id: string) {
    if (id === activeId) return setOpen(false);
    setBusy(true);
    try {
      await switchBusiness(id);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-[9px] text-left text-[12.5px] hover:border-[var(--border-strong)]"
      >
        <div className="min-w-0">
          <div className="truncate font-semibold text-[var(--ink)]">{activeName}</div>
          <div className="truncate text-[11px] text-[var(--ink-muted)]">{viewingAsAdmin ? "Viewing as platform admin" : activeMeta}</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3 flex-none text-[var(--ink-muted)]">
          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="px-3 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Your businesses</div>
          {memberships.map((m) => (
            <button
              key={m.company_id}
              disabled={busy}
              onClick={() => pick(m.company_id)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-[var(--surface-2)] disabled:opacity-50 ${
                m.company_id === activeId ? "font-semibold text-[var(--accent-strong)]" : "text-[var(--ink)]"
              }`}
            >
              <span className="truncate">{m.name}</span>
              {m.is_demo && <span className="flex-none text-[10.5px] text-[var(--ink-muted)]">Demo</span>}
            </button>
          ))}
          <div className="border-t border-[var(--border)]">
            <Link href="/onboarding" className="block px-3 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]">
              + Add a business
            </Link>
            {isAdmin && (
              <Link href="/admin" className="block px-3 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]">
                Platform admin
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
