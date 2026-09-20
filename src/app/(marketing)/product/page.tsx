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
  "Beyond payroll",
];

export default function ProductPage() {
  return (
    <>
      <section className="mx-auto max-w-[840px] px-5 pb-14 pt-16 sm:pt-24">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-white/50">Product</div>
        <h1 className="mt-2 text-[34px] font-bold tracking-tight text-white sm:text-[44px]">
          The sums were never the hard part.
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-white/65">
          Every payroll tool calculates PAYE, NI and pension deductions correctly. What costs UK SMEs money and
          trust is everything around that: reconciling disconnected systems by hand, discovering anomalies only
          after the money has moved, HMRC rule changes needing manual fixes, and nobody explaining why a payslip
          changed. Verity is built around that gap, not around the arithmetic.
        </p>
      </section>

      {GROUPS.map((group) => {
        const items = PILLARS.filter((p) => p.group === group);
        return (
          <section key={group} className="border-t border-[var(--mkt-border)] py-16">
            <div className="mx-auto max-w-[840px] px-5">
              <h2 className="text-[22px] font-bold tracking-tight text-white sm:text-[26px]">{group}</h2>
              <div className="mt-8 flex flex-col gap-8">
                {items.map((p) => (
                  <div key={p.letter} className="flex gap-4 sm:gap-5">
                    <div className="mkt-grad-bar flex h-9 w-9 flex-none items-center justify-center rounded-lg text-[14px] font-bold text-[#0a0f0a]">
                      {p.letter}
                    </div>
                    <div>
                      <h3 className="text-[16px] font-bold text-white">{p.title}</h3>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-white/65">{p.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      <section className="mx-auto max-w-[1180px] px-5 py-20">
        <div className="mkt-grad-bar flex flex-col items-start justify-between gap-6 rounded-3xl px-8 py-10 sm:flex-row sm:items-center sm:px-12">
          <div className="max-w-[480px]">
            <h2 className="text-[24px] font-bold text-[#0a0f0a] sm:text-[28px]">
              Want to see it against the field?
            </h2>
            <p className="mt-2 text-[14px] text-[#0a0f0a]/75">
              A full breakdown of where Sage, Xero, PayFit and the rest fall short.
            </p>
          </div>
          <Link href="/compare" className="mkt-pill flex-none bg-black px-6 py-3 text-[14px] font-semibold text-white">
            Compare Verity
          </Link>
        </div>
      </section>
    </>
  );
}
