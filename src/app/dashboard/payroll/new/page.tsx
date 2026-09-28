import Link from "next/link";
import { PayRunForm } from "@/components/PayRunForm";
import { getPayFrequenciesInUse } from "@/lib/payroll/runs";

export const dynamic = "force-dynamic";

/** Last weekday of the current month — the most common UK payday. */
function defaultPayDate(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default async function NewPayRunPage() {
  const frequencies = await getPayFrequenciesInUse();
  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Run payroll</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          Verity calculates every payslip — PAYE, National Insurance, pension and student loans at 2026/27 rates — as a draft you can
          review and adjust before approving.
        </div>
      </div>
      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow)]">
        {frequencies.length === 0 ? (
          <div className="text-[13px] text-[var(--ink-secondary)]">
            You don&rsquo;t have any employees yet.{" "}
            <Link href="/dashboard/employees" className="font-semibold text-[var(--accent-strong)]">
              Add your first employee
            </Link>{" "}
            with their salary, then come back here.
          </div>
        ) : (
          <PayRunForm frequencies={frequencies} defaultPayDate={defaultPayDate()} />
        )}
      </section>
    </div>
  );
}
