"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavIcon({ name }: { name: "grid" | "trend" | "people" | "doc" | "card" | "gear" | "flask" | "spark" | "diff" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8 } as const;
  switch (name) {
    case "grid":
      return (
        <svg viewBox="0 0 24 24" {...common} className="h-4 w-4 flex-none">
          <rect x="3" y="3" width="8" height="8" rx="1.6" />
          <rect x="13" y="3" width="8" height="8" rx="1.6" />
          <rect x="3" y="13" width="8" height="8" rx="1.6" />
          <rect x="13" y="13" width="8" height="8" rx="1.6" />
        </svg>
      );
    case "trend":
      return (
        <svg viewBox="0 0 24 24" {...common} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-none">
          <path d="M4 17l5-5 4 4 7-9" />
          <path d="M15 6h5v5" />
        </svg>
      );
    case "people":
      return (
        <svg viewBox="0 0 24 24" {...common} strokeLinecap="round" className="h-4 w-4 flex-none">
          <circle cx="12" cy="8" r="3.4" />
          <path d="M4.5 20c1.6-4 4.4-6 7.5-6s5.9 2 7.5 6" />
        </svg>
      );
    case "doc":
      return (
        <svg viewBox="0 0 24 24" {...common} strokeLinejoin="round" className="h-4 w-4 flex-none">
          <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M9 12h6M9 16h6" strokeLinecap="round" />
        </svg>
      );
    case "card":
      return (
        <svg viewBox="0 0 24 24" {...common} className="h-4 w-4 flex-none">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 9.5h18" />
        </svg>
      );
    case "gear":
      return (
        <svg viewBox="0 0 24 24" {...common} strokeLinejoin="round" className="h-4 w-4 flex-none">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.4-2-3.4-2.3.8a7.7 7.7 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.7 7.7 0 0 0-2.6 1.5l-2.3-.8-2 3.4 2 1.4a7.6 7.6 0 0 0 0 3l-2 1.4 2 3.4 2.3-.8a7.7 7.7 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.7 7.7 0 0 0 2.6-1.5l2.3.8 2-3.4Z" />
        </svg>
      );
    case "flask":
      return (
        <svg viewBox="0 0 24 24" {...common} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-none">
          <path d="M9 3h6M10 3v6l-5.5 9.5a1.5 1.5 0 0 0 1.3 2.5h12.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3" />
          <path d="M6.5 15.5h11" />
        </svg>
      );
    case "spark":
      return (
        <svg viewBox="0 0 24 24" {...common} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-none">
          <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" />
        </svg>
      );
    case "diff":
      return (
        <svg viewBox="0 0 24 24" {...common} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-none">
          <path d="M9 4v16M9 4L5 8M9 4l4 4" />
          <path d="M15 20V4M15 20l-4-4M15 20l4-4" />
        </svg>
      );
  }
}

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" as const, badge: true },
  { href: "/dashboard/runs/diff", label: "Run diff", icon: "diff" as const },
  { href: "/dashboard/profitability", label: "Profitability", icon: "trend" as const },
  { href: "/dashboard/agents", label: "AI Agents", icon: "spark" as const },
  { href: "/dashboard/simulator", label: "Simulator", icon: "flask" as const },
  { href: "/dashboard/employees", label: "Employees", icon: "people" as const },
  { href: "/dashboard/reports", label: "Reports", icon: "doc" as const },
  { href: "/dashboard/integrations", label: "Integrations", icon: "card" as const },
  { href: "/dashboard/settings", label: "Settings", icon: "gear" as const },
];

export function Sidebar({
  companyName,
  companyMeta,
  pendingCount,
}: {
  companyName: string;
  companyMeta: string;
  pendingCount: number;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-[236px] flex-none flex-col gap-[22px] border-r border-[var(--border)] bg-[var(--surface-2)] p-4 max-[760px]:hidden">
      <Link href="/" className="flex items-center gap-[9px] px-1">
        <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] bg-[var(--accent)]">
          <svg viewBox="0 0 24 24" fill="none" className="h-[15px] w-[15px]">
            <path d="M5 12.5L10 17L19 7" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="font-display text-[17px] font-semibold tracking-tight">Verity</div>
      </Link>

      <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-[9px] text-[12.5px]">
        <div className="min-w-0">
          <div className="truncate font-semibold text-[var(--ink)]">{companyName}</div>
          <div className="text-[11px] text-[var(--ink-muted)]">{companyMeta}</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3 flex-none text-[var(--ink-muted)]">
          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <nav className="flex flex-col gap-0.5">
        <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
          Workspace
        </div>
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "text-[var(--ink-secondary)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              }`}
            >
              <NavIcon name={item.icon} />
              {item.label}
              {item.badge && pendingCount > 0 && (
                <span className="ml-auto rounded-full bg-[var(--critical)] px-1.5 py-0.5 text-[10.5px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t border-[var(--border)] px-2.5 pt-2.5">
        <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent-strong)]">
          AS
        </div>
        <div>
          <div className="text-[12.5px] font-semibold">Aniket Sharma</div>
          <div className="text-[11px] text-[var(--ink-muted)]">Owner · 2FA enabled</div>
        </div>
      </div>
    </aside>
  );
}
