import Link from "next/link";
import { COMPETITORS } from "@/lib/competitors";
import { PILLARS } from "@/lib/pillars";

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

const HIGHLIGHT_LETTERS = ["A", "B", "C", "E", "D", "I"];
const highlights = PILLARS.filter((p) => HIGHLIGHT_LETTERS.includes(p.letter));

export default function MarketingHome() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-[1120px] px-5 pb-16 pt-16 sm:pb-20 sm:pt-24">
        <div className="max-w-[760px]">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[12px] font-medium text-[var(--ink-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--good)]" />
            Built for UK SMEs, 1&ndash;50 employees
          </div>
          <h1 className="font-display mt-5 text-[38px] font-semibold leading-[1.1] tracking-tight sm:text-[52px]">
            Payroll that catches problems before payday, not after.
          </h1>
          <p className="mt-5 max-w-[600px] text-[16px] leading-relaxed text-[var(--ink-secondary)] sm:text-[17px]">
            Getting the sums right is a solved problem — every payroll tool manages that. Verity is built around
            everything else: reconciling messy source data, catching anomalies mid-cycle, and explaining exactly why
            a payslip changed, to HR, the employee and the accountant at once.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg bg-[var(--accent)] px-5 py-3 text-[14px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
            >
              View live demo
            </Link>
            <Link
              href="/product"
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-3 text-[14px] font-semibold text-[var(--ink)] hover:border-[var(--accent)]"
            >
              See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* Cost strip */}
      <section className="border-y border-[var(--border)] bg-[var(--surface-2)]">
        <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-6 px-5 py-10 sm:grid-cols-3">
          <div>
            <div className="font-num text-[26px] font-semibold text-[var(--critical)]">£100&ndash;£400</div>
            <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">
              HMRC penalty per month for late RTI (FPS) filing, scaling with headcount.
            </p>
          </div>
          <div>
            <div className="font-num text-[26px] font-semibold text-[var(--critical)]">200%</div>
            <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">
              Penalty on National Minimum Wage underpayment — capped at £20,000 per worker.
            </p>
          </div>
          <div>
            <div className="font-num text-[26px] font-semibold text-[var(--accent-strong)]">~40%</div>
            <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">
              of UK businesses have 1&ndash;50 employees — too complex for desktop tools, badly served by enterprise ones.
            </p>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-[1120px] px-5 py-20">
        <div className="max-w-[560px]">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--accent-strong)]">
            The real problem
          </div>
          <h2 className="font-display mt-2 text-[28px] font-semibold tracking-tight sm:text-[32px]">
            It was never the arithmetic.
          </h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <h3 className="text-[15px] font-semibold">{p.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-secondary)]">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture diagram */}
      <section className="border-y border-[var(--border)] bg-[var(--surface-2)] py-20">
        <div className="mx-auto max-w-[1120px] px-5">
          <div className="max-w-[560px]">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--accent-strong)]">
              How it's structured
            </div>
            <h2 className="font-display mt-2 text-[28px] font-semibold tracking-tight sm:text-[32px]">
              One shared source of truth, three audiences.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-secondary)]">
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
            <div className="rounded-full bg-[var(--good-soft)] px-5 py-2.5 text-[13px] font-semibold text-[var(--good-ink)]">
              Payroll authorised
            </div>
          </div>
        </div>
      </section>

      {/* Differentiation highlights */}
      <section className="mx-auto max-w-[1120px] px-5 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-[560px]">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--accent-strong)]">
              What makes Verity different
            </div>
            <h2 className="font-display mt-2 text-[28px] font-semibold tracking-tight sm:text-[32px]">
              Built around what the incumbents skip.
            </h2>
          </div>
          <Link href="/product" className="text-[13.5px] font-semibold text-[var(--accent-strong)] hover:underline">
            See the full breakdown &rarr;
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((p) => (
            <div key={p.letter} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[13px] font-bold text-[var(--accent-strong)]">
                {p.letter}
              </div>
              <h3 className="mt-3.5 text-[15px] font-semibold">{p.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-secondary)]">{p.summary}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Competitor snapshot */}
      <section className="border-y border-[var(--border)] bg-[var(--surface-2)] py-20">
        <div className="mx-auto max-w-[1120px] px-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-[560px]">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--accent-strong)]">
                The competitive landscape
              </div>
              <h2 className="font-display mt-2 text-[28px] font-semibold tracking-tight sm:text-[32px]">
                Desktop-era and cheap, or feature-rich and fragile.
              </h2>
            </div>
            <Link href="/compare" className="text-[13.5px] font-semibold text-[var(--accent-strong)] hover:underline">
              See the full comparison &rarr;
            </Link>
          </div>

          <div className="mt-10 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full min-w-[560px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[12px] uppercase tracking-wide text-[var(--ink-muted)]">
                  <th className="px-5 py-3.5 font-semibold">Competitor</th>
                  <th className="px-5 py-3.5 font-semibold">Where it breaks</th>
                </tr>
              </thead>
              <tbody>
                {COMPETITORS.slice(0, 3).map((c) => (
                  <tr key={c.name} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-5 py-4 align-top font-semibold">{c.name}</td>
                    <td className="px-5 py-4 align-top text-[var(--ink-secondary)]">{c.weakness}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="mx-auto max-w-[1120px] px-5 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-[var(--accent)] px-8 py-10 sm:flex-row sm:items-center sm:px-12">
          <div className="max-w-[480px]">
            <h2 className="font-display text-[24px] font-semibold text-[var(--accent-ink)] sm:text-[28px]">
              See the exception-first review flow in action.
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

function FlowBox({ label, caption, wide }: { label: string; caption?: string; wide?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3.5 text-center ${
        wide ? "w-full max-w-[640px]" : ""
      }`}
    >
      <div className="text-[13.5px] font-semibold">{label}</div>
      {caption && <div className="mt-0.5 text-[11px] text-[var(--ink-muted)]">{caption}</div>}
    </div>
  );
}

function FlowArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-[var(--ink-muted)]">
      <path d="M12 4v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
