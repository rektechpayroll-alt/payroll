import Link from "next/link";
import { COMPETITORS } from "@/lib/competitors";
import { PILLARS } from "@/lib/pillars";
import { AgentsPreview } from "@/components/marketing/AgentsPreview";

const PROBLEMS = [
  {
    title: "Disconnected systems",
    body: "Time-and-attendance exports get hand-mapped into payroll columns every cycle. Every hand-mapping is a chance for a human entry error.",
  },
  {
    title: "Anomalies found too late",
    body: "Pay leaves the account, and only then does someone notice the missed overtime or the wrong tax code. Trust erodes, cycle after cycle.",
  },
  {
    title: "Rigid corrections",
    body: "When HMRC's rules shift and the system hasn't kept up, an accountant fixes it by hand — the exact bottleneck automation was meant to remove.",
  },
];

const HIGHLIGHT_LETTERS = ["A", "B", "E", "D", "K", "L"];
const highlights = PILLARS.filter((p) => HIGHLIGHT_LETTERS.includes(p.letter));

const SEGMENTS = [
  { label: "Payroll", href: "/product", active: true },
  { label: "Compliance & HR", href: "/product" },
  { label: "Simulator", href: "/dashboard/simulator" },
  { label: "AI Agents", href: "/dashboard/agents" },
];

const TIERS = [
  {
    eyebrow: "0–100 employees",
    name: "Business",
    price: "£49/mo + £3.50/employee",
    body: "Deterministic engine, AI variance layer, Continuous Payroll Ledger, direct RTI + NEST.",
    href: "/pricing",
  },
  {
    eyebrow: "100–1,000 employees",
    name: "Growth",
    price: "£299/mo + £2.25/employee",
    body: "Multi-party dashboard, cross-system ingestion agent, \"What if?\" Simulator.",
    href: "/pricing",
  },
  {
    eyebrow: "1,000+ employees",
    name: "Enterprise",
    price: "Custom pricing",
    body: "Multi-entity consolidation, approval chains, enterprise SSO/SCIM, open API.",
    href: "/pricing",
  },
];

export default function MarketingHome() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
          style={{
            background:
              "radial-gradient(600px 320px at 12% 0%, rgba(74,222,128,0.16), transparent 60%), radial-gradient(600px 320px at 88% 10%, rgba(167,139,250,0.16), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-[900px] px-5 pb-14 pt-20 text-center sm:pt-28">
          <div className="mkt-glow mkt-pill inline-flex items-center gap-2 bg-white/[0.03] px-3.5 py-1.5 text-[12.5px] font-medium text-white/75">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
            AI-powered payroll software, for every stage of business
          </div>
          <h1 className="mt-6 text-[36px] font-extrabold leading-[1.08] tracking-tight text-white sm:text-[54px]">
            Payroll that catches problems before payday, not after.
          </h1>
          <p className="mx-auto mt-5 max-w-[620px] text-[16px] leading-relaxed text-white/65 sm:text-[17px]">
            Getting the sums right is a solved problem. Verity is built around everything else: reconciling messy
            source data, catching anomalies mid-cycle, and explaining exactly why a payslip changed — to HR, the
            employee and the accountant at once.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/dashboard" className="mkt-pill bg-white px-5 py-3 text-[14px] font-semibold text-black hover:bg-white/90">
              View live demo
            </Link>
            <Link
              href="/product"
              className="mkt-pill border border-white/20 px-5 py-3 text-[14px] font-semibold text-white hover:bg-white/5"
            >
              See how it works
            </Link>
          </div>

          <div className="mkt-glow mkt-pill mt-10 inline-flex flex-wrap items-center justify-center gap-1 bg-white/[0.03] p-1.5">
            {SEGMENTS.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className={`mkt-pill px-4 py-2 text-[13px] font-semibold ${
                  s.active ? "bg-[#4ade80] text-[#0a0f0a]" : "text-white/70 hover:text-white"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="relative mx-auto max-w-[1180px] px-5 pb-20">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {TIERS.map((t) => (
              <div key={t.name} className="flex flex-col rounded-2xl bg-[var(--mkt-card-bg)] p-6">
                <div className="text-[12px] font-semibold text-[var(--mkt-card-ink-secondary)]">{t.eyebrow}</div>
                <div className="mt-1.5 text-[19px] font-bold text-[var(--mkt-card-ink)]">{t.name}</div>
                <div className="mt-1 text-[13px] font-semibold text-[var(--mkt-card-ink-secondary)]">{t.price}</div>
                <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-[var(--mkt-card-ink-secondary)]">{t.body}</p>
                <Link
                  href={t.href}
                  className="mkt-pill mt-5 inline-flex w-fit bg-black px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-black/85"
                >
                  Discover {t.name}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section className="border-y border-[var(--mkt-border)] bg-white/[0.02]">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-6 px-5 py-10 sm:grid-cols-3">
          <div>
            <div className="font-num text-[26px] font-semibold text-white">£100&ndash;£400</div>
            <p className="mt-1 text-[13px] text-white/55">
              HMRC penalty per month for late RTI (FPS) filing, scaling with headcount.
            </p>
          </div>
          <div>
            <div className="font-num text-[26px] font-semibold text-white">200%</div>
            <p className="mt-1 text-[13px] text-white/55">
              Penalty on National Minimum Wage underpayment — capped at £20,000 per worker.
            </p>
          </div>
          <div>
            <div className="font-num mkt-grad-text text-[26px] font-semibold">3 tiers</div>
            <p className="mt-1 text-[13px] text-white/55">
              0&ndash;100, 100&ndash;1,000, and 1,000+ employees — the same exception-first review flow at every size.
            </p>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-[1180px] px-5 py-20">
        <div className="max-w-[560px]">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/50">The real problem</div>
          <h2 className="mt-2 text-[28px] font-bold tracking-tight text-white sm:text-[32px]">
            It was never the arithmetic.
          </h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="rounded-2xl bg-[var(--mkt-card-bg)] p-6">
              <h3 className="text-[15px] font-bold text-[var(--mkt-card-ink)]">{p.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--mkt-card-ink-secondary)]">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI Agents */}
      <section className="border-y border-[var(--mkt-border)] bg-white/[0.02] py-20">
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="mkt-pill mx-auto inline-flex w-fit items-center gap-2 border border-white/15 bg-white/[0.03] px-3.5 py-1.5 text-[12.5px] font-medium text-white/70">
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-[#4ade80]">
              <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" fill="currentColor" />
            </svg>
            New AI agents for payroll, compliance and close
          </div>
          <h2 className="mt-4 text-center text-[28px] font-bold tracking-tight text-white sm:text-[36px]">
            Get work done faster with <span className="mkt-grad-text">Verity AI</span> agents
          </h2>
          <p className="mx-auto mt-3 max-w-[560px] text-center text-[14.5px] leading-relaxed text-white/60">
            Task-specific agents that work against your real payroll data — not a general chatbot bolted on top.
          </p>
          <div className="mt-10">
            <AgentsPreview />
          </div>
        </div>
      </section>

      {/* Architecture diagram */}
      <section className="py-20">
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="max-w-[560px]">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-white/50">How it's structured</div>
            <h2 className="mt-2 text-[28px] font-bold tracking-tight text-white sm:text-[32px]">
              One shared source of truth, three audiences.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-white/60">
              HR and employees each see a live dashboard scoped to them. Both roll up into a combined view — HR,
              employee data, bank statements and HMRC compliance together — and only that reconciled view can
              authorise payroll.
            </p>
          </div>

          <div className="mt-10 flex flex-col items-center gap-3">
            <div className="grid w-full max-w-[640px] grid-cols-2 gap-4">
              <FlowBox label="HR" />
              <FlowBox label="Employees" />
            </div>
            <FlowArrow />
            <div className="grid w-full max-w-[640px] grid-cols-2 gap-4">
              <FlowBox label="Dashboard" caption="visible to HR + accountant" />
              <FlowBox label="Dashboard" caption="visible to all parties" />
            </div>
            <FlowArrow />
            <FlowBox label="HR + Employee + Bank statements + HMRC compliance" wide caption="visible to accountant" />
            <FlowArrow />
            <div className="mkt-grad-bar mkt-pill px-5 py-2.5 text-[13px] font-semibold text-[#0a0f0a]">
              Payroll authorised
            </div>
          </div>
        </div>
      </section>

      {/* Differentiation highlights */}
      <section className="border-y border-[var(--mkt-border)] bg-white/[0.02] py-20">
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-[560px]">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-white/50">
                What makes Verity different
              </div>
              <h2 className="mt-2 text-[28px] font-bold tracking-tight text-white sm:text-[32px]">
                Built around what the incumbents skip.
              </h2>
            </div>
            <Link href="/product" className="text-[13.5px] font-semibold text-white/80 hover:text-white hover:underline">
              See the full breakdown &rarr;
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {highlights.map((p) => (
              <div key={p.letter} className="rounded-2xl bg-[var(--mkt-card-bg)] p-6">
                <div className="mkt-grad-bar flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-bold text-[#0a0f0a]">
                  {p.letter}
                </div>
                <h3 className="mt-3.5 text-[15px] font-bold text-[var(--mkt-card-ink)]">{p.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--mkt-card-ink-secondary)]">{p.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Competitor snapshot */}
      <section className="py-20">
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-[560px]">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-white/50">
                The competitive landscape
              </div>
              <h2 className="mt-2 text-[28px] font-bold tracking-tight text-white sm:text-[32px]">
                Desktop-era and cheap, or feature-rich and fragile.
              </h2>
            </div>
            <Link href="/compare" className="text-[13.5px] font-semibold text-white/80 hover:text-white hover:underline">
              See the full comparison &rarr;
            </Link>
          </div>

          <div className="mt-10 overflow-x-auto rounded-2xl bg-[var(--mkt-card-bg)]">
            <table className="w-full min-w-[560px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-black/10 text-[12px] uppercase tracking-wide text-[var(--mkt-card-ink-secondary)]">
                  <th className="px-5 py-3.5 font-semibold">Competitor</th>
                  <th className="px-5 py-3.5 font-semibold">Where it breaks</th>
                </tr>
              </thead>
              <tbody>
                {COMPETITORS.slice(0, 3).map((c) => (
                  <tr key={c.name} className="border-b border-black/10 last:border-0">
                    <td className="px-5 py-4 align-top font-semibold text-[var(--mkt-card-ink)]">{c.name}</td>
                    <td className="px-5 py-4 align-top text-[var(--mkt-card-ink-secondary)]">{c.weakness}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="mx-auto max-w-[1180px] px-5 pb-24">
        <div className="mkt-grad-bar flex flex-col items-start justify-between gap-6 rounded-3xl px-8 py-10 sm:flex-row sm:items-center sm:px-12">
          <div className="max-w-[480px]">
            <h2 className="text-[24px] font-bold text-[#0a0f0a] sm:text-[28px]">
              See the exception-first review flow in action.
            </h2>
            <p className="mt-2 text-[14px] text-[#0a0f0a]/75">
              A working demo, seeded with a real payroll run — no sign-up required.
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

function FlowBox({ label, caption, wide }: { label: string; caption?: string; wide?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3.5 text-center text-white ${
        wide ? "w-full max-w-[640px]" : ""
      }`}
    >
      <div className="text-[13.5px] font-semibold">{label}</div>
      {caption && <div className="mt-0.5 text-[11px] text-white/50">{caption}</div>}
    </div>
  );
}

function FlowArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white/40">
      <path d="M12 4v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
