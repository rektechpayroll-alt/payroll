import Link from "next/link";

const TIERS = [
  {
    name: "Starter",
    range: "1–10 employees",
    price: "£29",
    perEmployee: "+ £4",
    blurb: "Everything you need to run exception-first payroll without an accountant on standby.",
    features: [
      "Deterministic payroll engine + AI variance layer",
      "Conversational Payslip Explainer",
      "Direct HMRC RTI (FPS/EPS) + NEST pipeline",
      "Full statutory coverage (SSP/SMP/SPP/SAP/ShPP, NMW, IR35)",
    ],
  },
  {
    name: "Growth",
    range: "11–50 employees",
    price: "£79",
    perEmployee: "+ £4",
    blurb: "Adds the multi-party dashboard and cross-system ingestion once HR and accounting split apart.",
    features: [
      "Everything in Starter",
      "HR + Employee + Accountant dashboard architecture",
      "Cross-system ingestion agent (CSV/PDF/T&A auto-mapping)",
      "Overtime, leave & expenses portal with bank reconciliation",
      "“What if?” Payroll Simulator",
    ],
    highlighted: true,
  },
  {
    name: "Scale",
    range: "50+ employees",
    price: "Custom",
    perEmployee: null,
    blurb: "For businesses with more complex approval chains or multiple entities.",
    features: [
      "Everything in Growth",
      "Custom rules & workflow configuration",
      "Multi-entity consolidation",
      "Dedicated onboarding & priority support",
    ],
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-[840px] px-5 pb-12 pt-16 text-center sm:pt-24">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--accent-strong)]">Pricing</div>
        <h1 className="font-display mt-2 text-[34px] font-semibold tracking-tight sm:text-[44px]">
          Priced for the value it delivers, not just your headcount.
        </h1>
        <p className="mx-auto mt-5 max-w-[600px] text-[16px] leading-relaxed text-[var(--ink-secondary)]">
          Most UK payroll tools charge more per employee as you grow — punishing the exact growth you're trying to
          achieve. Verity's per-employee rate stays flat across tiers; what changes as you move up is the depth of
          the AI variance, ingestion and multi-party dashboard features, not the price of the people you already have.
        </p>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pb-20">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col rounded-2xl border p-7 ${
                tier.highlighted
                  ? "border-[var(--accent)] bg-[var(--surface)] shadow-[var(--shadow)]"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }`}
            >
              {tier.highlighted && (
                <div className="mb-3 inline-flex w-fit items-center rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-strong)]">
                  Most common
                </div>
              )}
              <h2 className="text-[18px] font-semibold">{tier.name}</h2>
              <div className="text-[12.5px] text-[var(--ink-muted)]">{tier.range}</div>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="font-num text-[32px] font-semibold">{tier.price}</span>
                {tier.perEmployee && (
                  <span className="text-[13px] text-[var(--ink-muted)]">/mo {tier.perEmployee}/employee</span>
                )}
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--ink-secondary)]">{tier.blurb}</p>
              <ul className="mt-6 flex flex-col gap-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2 text-[13px] leading-relaxed">
                    <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 flex-none text-[var(--good)]">
                      <path d="M5 12.5L10 17L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-[var(--ink-secondary)]">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard"
                className={`mt-7 rounded-lg px-4 py-2.5 text-center text-[13.5px] font-semibold ${
                  tier.highlighted
                    ? "bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
                    : "border border-[var(--border-strong)] text-[var(--ink)] hover:border-[var(--accent)]"
                }`}
              >
                {tier.price === "Custom" ? "Talk to us" : "Try the demo"}
              </Link>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-[640px] text-center text-[12.5px] text-[var(--ink-muted)]">
          Indicative introductory pricing while Verity is in early access — final pricing will be confirmed before
          general availability.
        </p>
      </section>

      <section className="border-t border-[var(--border)] py-16">
        <div className="mx-auto max-w-[840px] px-5">
          <h2 className="font-display text-[22px] font-semibold tracking-tight sm:text-[26px]">
            Why not price per employee like everyone else?
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-[var(--ink-secondary)]">
            Every per-employee-per-month competitor — PayFit, Employment Hero, Rippling, BrightPay — scales price
            with headcount alone, and it's a well-documented reason growing businesses resent PayFit specifically.
            Verity's tiers gate feature depth, not the cost of people you already employ, and the value on top of
            that — errors caught before payday, penalties avoided, hours of reconciliation removed — is what future
            add-ons will be priced against, not headcount.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-[var(--accent)] px-8 py-10 sm:flex-row sm:items-center sm:px-12">
          <div className="max-w-[480px]">
            <h2 className="font-display text-[24px] font-semibold text-[var(--accent-ink)] sm:text-[28px]">
              Try the review flow before you commit to anything.
            </h2>
            <p className="mt-2 text-[14px] text-[var(--accent-ink)]/85">
              A working demo, seeded with a real payroll run — no sign-up required.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="flex-none rounded-lg bg-[var(--accent-ink)] px-6 py-3 text-[14px] font-semibold text-[var(--accent)]"
          >
            View live demo
          </Link>
        </div>
      </section>
    </>
  );
}
