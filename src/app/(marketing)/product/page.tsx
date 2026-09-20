import Link from "next/link";
import { PILLARS, type Pillar } from "@/lib/pillars";

const GROUPS: Pillar["group"][] = [
  "Catch it before payday",
  "Explain, don't escalate",
  "Built for the workforce, not just HR",
  "One shared source of truth",
  "Compliance that keeps up",
  "See around corners",
  "Built to scale",
];

export default function ProductPage() {
  return (
    <>
      <section className="mx-auto max-w-[840px] px-5 pb-14 pt-16 sm:pt-24">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--accent-strong)]">Product</div>
        <h1 className="font-display mt-2 text-[34px] font-semibold tracking-tight sm:text-[44px]">
          The sums were never the hard part.
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-[var(--ink-secondary)]">
          Every payroll tool calculates PAYE, NI and pension deductions correctly. What costs UK SMEs money and
          trust is everything around that: reconciling disconnected systems by hand, discovering anomalies only
          after the money has moved, HMRC rule changes needing manual fixes, and nobody explaining why a payslip
          changed. Verity is built around that gap, not around the arithmetic.
        </p>
      </section>

      {GROUPS.map((group) => {
        const items = PILLARS.filter((p) => p.group === group);
        return (
          <section key={group} className="border-t border-[var(--border)] py-16">
            <div className="mx-auto max-w-[840px] px-5">
              <h2 className="font-display text-[22px] font-semibold tracking-tight sm:text-[26px]">{group}</h2>
              <div className="mt-8 flex flex-col gap-8">
                {items.map((p) => (
                  <div key={p.letter} className="flex gap-4 sm:gap-5">
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[14px] font-bold text-[var(--accent-strong)]">
                      {p.letter}
                    </div>
                    <div>
                      <h3 className="text-[16px] font-semibold">{p.title}</h3>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--ink-secondary)]">{p.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      <section className="mx-auto max-w-[1120px] px-5 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-[var(--accent)] px-8 py-10 sm:flex-row sm:items-center sm:px-12">
          <div className="max-w-[480px]">
            <h2 className="font-display text-[24px] font-semibold text-[var(--accent-ink)] sm:text-[28px]">
              Want to see it against the field?
            </h2>
            <p className="mt-2 text-[14px] text-[var(--accent-ink)]/85">
              A full breakdown of where Sage, Xero, PayFit and the rest fall short.
            </p>
          </div>
          <Link
            href="/compare"
            className="flex-none rounded-lg bg-[var(--accent-ink)] px-6 py-3 text-[14px] font-semibold text-[var(--accent)]"
          >
            Compare Verity
          </Link>
        </div>
      </section>
    </>
  );
}
