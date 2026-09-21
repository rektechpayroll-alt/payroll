import Link from "next/link";

const TIERS = [
  {
    name: "Business",
    range: "0–100 employees",
    price: "£49",
    perEmployee: "+ £3.50",
    blurb: "Everything you need to run exception-first payroll without an accountant on standby.",
    features: [
      "Deterministic payroll engine + AI variance layer",
      "Continuous Payroll Ledger with mid-month preview runs",
      "Conversational Payslip Explainer",
      "Direct HMRC RTI (FPS/EPS) + NEST pipeline",
      "Full statutory coverage (SSP/SMP/SPP/SAP/ShPP, NMW, IR35)",
    ],
  },
  {
    name: "Growth",
    range: "100–1,000 employees",
    price: "£299",
    perEmployee: "+ £2.25",
    blurb: "Adds the multi-party dashboard, cross-system ingestion, AI agents and planning tools once HR and accounting split into their own teams.",
    features: [
      "Everything in Business",
      "Compliance, Reconciliation & Close AI agents",
      "HR + Employee + Accountant dashboard architecture",
      "Cross-system ingestion agent (CSV/PDF/T&A auto-mapping)",
      "Overtime, leave & expenses portal with bank reconciliation",
      "“What if?” Payroll Simulator",
    ],
    highlighted: true,
  },
  {
    name: "Enterprise",
    range: "1,000+ employees",
    price: "Custom",
    perEmployee: null,
    blurb: "For group structures, complex approval chains, and payroll teams that need to plug into an existing enterprise stack.",
    features: [
      "Everything in Growth",
      "Multi-entity consolidation across subsidiaries",
      "Role-based approval chains with delegated sign-off",
      "Enterprise SSO (SAML) & SCIM provisioning",
      "Open API & native HRIS sync (Workday, BambooHR, iTrent)",
      "Dedicated onboarding & priority support",
    ],
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-[840px] px-5 pb-12 pt-16 text-center sm:pt-24">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-white/50">Pricing</div>
        <h1 className="mt-2 text-[34px] font-bold tracking-tight text-white sm:text-[44px]">
          Priced for the value it delivers, not just your headcount.
        </h1>
        <p className="mx-auto mt-5 max-w-[600px] text-[16px] leading-relaxed text-white/65">
          Most UK payroll tools charge a flat per-employee rate no matter how big you get — punishing the exact
          growth you're trying to achieve. Verity's per-employee rate steps down as you move into a bigger tier, and
          each tier adds the features that headcount actually demands — AI agents, cross-system ingestion,
          multi-entity consolidation, enterprise SSO — rather than just multiplying the same bill.
        </p>
      </section>

      <section className="mx-auto max-w-[1180px] px-5 pb-20">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col rounded-2xl bg-[var(--mkt-card-bg)] p-7 ${tier.highlighted ? "mkt-glow" : ""}`}
            >
              {tier.highlighted && (
                <div className="mkt-grad-bar mb-3 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#0a0f0a]">
                  Most common
                </div>
              )}
              <h2 className="text-[18px] font-bold text-[var(--mkt-card-ink)]">{tier.name}</h2>
              <div className="text-[12.5px] text-[var(--mkt-card-ink-secondary)]">{tier.range}</div>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="font-num text-[32px] font-bold text-[var(--mkt-card-ink)]">{tier.price}</span>
                {tier.perEmployee && (
                  <span className="text-[13px] text-[var(--mkt-card-ink-secondary)]">/mo {tier.perEmployee}/employee</span>
                )}
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--mkt-card-ink-secondary)]">{tier.blurb}</p>
              <ul className="mt-6 flex flex-col gap-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2 text-[13px] leading-relaxed">
                    <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 flex-none text-emerald-600">
                      <path d="M5 12.5L10 17L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-[var(--mkt-card-ink-secondary)]">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard"
                className={`mkt-pill mt-7 px-4 py-2.5 text-center text-[13.5px] font-semibold ${
                  tier.highlighted ? "bg-black text-white hover:bg-black/85" : "border border-black/15 text-[var(--mkt-card-ink)] hover:bg-black/5"
                }`}
              >
                {tier.price === "Custom" ? "Talk to us" : "Try the demo"}
              </Link>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-[640px] text-center text-[12.5px] text-white/45">
          Indicative introductory pricing while Verity is in early access — final pricing will be confirmed before
          general availability.
        </p>
      </section>

      <section className="border-t border-[var(--mkt-border)] py-16">
        <div className="mx-auto max-w-[840px] px-5">
          <h2 className="text-[22px] font-bold tracking-tight text-white sm:text-[26px]">
            Why does the per-employee rate go down, not up?
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed text-white/65">
            Every per-employee-per-month competitor — PayFit, Employment Hero, Rippling, BrightPay — charges the
            same rate no matter how big you get, and it's a well-documented reason growing businesses resent PayFit
            specifically. Verity's rate steps down at 100 and again at 1,000 employees, because the marginal cost of
            running one more person through an already-configured payroll is small — the real cost is the setup,
            the integrations and the review time, which is what each tier's added features are actually priced
            against, not raw headcount.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-5 py-20">
        <div className="mkt-grad-bar flex flex-col items-start justify-between gap-6 rounded-3xl px-8 py-10 sm:flex-row sm:items-center sm:px-12">
          <div className="max-w-[480px]">
            <h2 className="text-[24px] font-bold text-[#0a0f0a] sm:text-[28px]">
              Try the review flow before you commit to anything.
            </h2>
            <p className="mt-2 text-[14px] text-[#0a0f0a]/75">
              A working demo, seeded with a real payroll run — sign up free, no card required.
            </p>
          </div>
          <Link href="/dashboard" className="mkt-pill flex-none bg-black px-6 py-3 text-[14px] font-semibold text-white">
            View live demo
          </Link>
        </div>
      </section>
    </>
  );
}
