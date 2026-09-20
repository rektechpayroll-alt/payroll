import Link from "next/link";
import { COMPETITORS, MARKET_GAPS, SECONDARY_COMPETITORS_NOTE } from "@/lib/competitors";

export default function ComparePage() {
  return (
    <>
      <section className="mx-auto max-w-[840px] px-5 pb-14 pt-16 sm:pt-24">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--accent-strong)]">Compare</div>
        <h1 className="font-display mt-2 text-[34px] font-semibold tracking-tight sm:text-[44px]">
          Desktop-era and cheap, or feature-rich and fragile.
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-[var(--ink-secondary)]">
          Every current UK payroll option falls into one of two buckets: solid on compliance but stuck in a
          desktop-era interface, or feature-rich but fragile to configure and still dependent on manual accountant
          intervention when anything goes wrong.
        </p>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pb-16">
        <div className="flex flex-col gap-5">
          {COMPETITORS.map((c) => (
            <div key={c.name} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[17px] font-semibold">{c.name}</h2>
                <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-[11.5px] font-medium text-[var(--ink-muted)]">
                  {c.pricing}
                </span>
              </div>
              <div className="mt-1 text-[12px] text-[var(--ink-muted)]">{c.targetCustomer}</div>

              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                  What it offers
                </div>
                <ul className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-1 text-[13px] leading-relaxed text-[var(--ink-secondary)] sm:grid-cols-2">
                  {c.features.map((f) => (
                    <li key={f} className="flex gap-1.5">
                      <span className="text-[var(--ink-muted)]">&middot;</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--good-ink)]">
                    Real strength
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--ink-secondary)]">{c.strength}</p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--critical)]">
                    Where it breaks
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--ink-secondary)]">{c.weakness}</p>
                </div>
              </div>
              <div className="mt-4 border-t border-[var(--border)] pt-3 text-[12.5px] text-[var(--ink-muted)]">
                Best for: {c.bestFor}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-[13px] leading-relaxed text-[var(--ink-muted)]">{SECONDARY_COMPETITORS_NOTE}</p>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--surface-2)] py-16">
        <div className="mx-auto max-w-[840px] px-5">
          <h2 className="font-display text-[24px] font-semibold tracking-tight sm:text-[28px]">
            What none of them do
          </h2>
          <ul className="mt-6 flex flex-col gap-4">
            {MARKET_GAPS.map((gap) => (
              <li key={gap} className="flex gap-3 text-[14.5px] leading-relaxed text-[var(--ink-secondary)]">
                <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-5 w-5 flex-none text-[var(--good)]">
                  <path d="M5 12.5L10 17L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{gap}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-[var(--accent)] px-8 py-10 sm:flex-row sm:items-center sm:px-12">
          <div className="max-w-[480px]">
            <h2 className="font-display text-[24px] font-semibold text-[var(--accent-ink)] sm:text-[28px]">
              See how Verity closes those gaps.
            </h2>
            <p className="mt-2 text-[14px] text-[var(--accent-ink)]/85">
              Eighteen product pillars, built around the gaps competitors leave open — not backward-looking compliance box-ticking.
            </p>
          </div>
          <Link
            href="/product"
            className="flex-none rounded-lg bg-[var(--accent-ink)] px-6 py-3 text-[14px] font-semibold text-[var(--accent)]"
          >
            See the product
          </Link>
        </div>
      </section>
    </>
  );
}
