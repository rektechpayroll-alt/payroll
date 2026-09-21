import Link from "next/link";
import { gbp } from "@/lib/format";

/** The "Accounting Dashboard" idea — bank balance, AR and AP outstanding at a glance, each linking straight into the module that owns it. */
export function BusinessSnapshot({
  bankBalance,
  arOutstanding,
  apOutstanding,
}: {
  bankBalance: number;
  arOutstanding: number;
  apOutstanding: number;
}) {
  const netPosition = bankBalance + arOutstanding - apOutstanding;

  const items = [
    { label: "Bank balance", value: bankBalance, href: "/dashboard/cashflow" },
    { label: "Owed to you", value: arOutstanding, href: "/dashboard/ledger", positive: true },
    { label: "You owe", value: apOutstanding, href: "/dashboard/purchasing", negative: true },
    { label: "Net position", value: netPosition, href: "/dashboard/contacts" },
  ];

  return (
    <div className="mb-[18px] grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {items.map((it) => (
        <Link
          key={it.label}
          href={it.href}
          className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 shadow-[var(--shadow)] hover:border-[var(--border-strong)]"
        >
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{it.label}</div>
          <div
            className="font-num mt-1 text-[16.5px] font-bold"
            style={{ color: it.negative ? "var(--critical-ink)" : it.positive ? "var(--good-ink)" : "var(--ink)" }}
          >
            {gbp(it.value)}
          </div>
        </Link>
      ))}
    </div>
  );
}
