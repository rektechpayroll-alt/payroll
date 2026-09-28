import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { gbp } from "@/lib/format";
import { getPayRun, getPayslipLines, getYearToDate } from "@/lib/payroll/runs";
import { getCompany } from "@/lib/queries";

export const dynamic = "force-dynamic";

function Row({ label, value, ytd, strong }: { label: string; value: number; ytd?: number; strong?: boolean }) {
  return (
    <tr className={strong ? "font-semibold" : ""}>
      <td className="py-1.5">{label}</td>
      <td className="font-num py-1.5 text-right">{gbp(value)}</td>
      <td className="font-num py-1.5 text-right text-[var(--ink-muted)]">{ytd === undefined ? "" : gbp(ytd)}</td>
    </tr>
  );
}

export default async function PayslipPage({ params }: { params: Promise<{ id: string; lineId: string }> }) {
  const { id, lineId } = await params;
  const run = await getPayRun(id);
  if (!run || run.source !== "engine") notFound();
  const line = (await getPayslipLines(id)).find((l) => l.id === lineId);
  if (!line) notFound();
  const company = await getCompany();
  const ytd = line.employee_id ? await getYearToDate(line.employee_id, id) : null;
  const loans = (line.student_loan ?? 0) + (line.postgrad_loan ?? 0);

  return (
    <div className="max-w-[720px]">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/payroll/${id}`} className="text-[12px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
          ← {run.period_label}
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] print:border-0 print:shadow-none">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Payslip</div>
            <h1 className="font-display text-[22px] font-semibold">{line.employee_name}</h1>
            <div className="text-[12.5px] text-[var(--ink-secondary)]">{line.role}</div>
          </div>
          <div className="text-right text-[12.5px] text-[var(--ink-secondary)]">
            <div className="font-semibold text-[var(--ink)]">{company.name}</div>
            <div>Pay date {run.pay_date}</div>
            <div>
              Tax year {run.tax_year} · period {run.tax_period}
            </div>
          </div>
        </header>

        <dl className="mb-5 grid grid-cols-3 gap-3 text-[12px] max-[520px]:grid-cols-1">
          <div>
            <dt className="text-[var(--ink-muted)]">Tax code</dt>
            <dd className="font-num font-semibold">
              {line.tax_code_used}
              {line.tax_basis === "non-cumulative" ? " (Wk1/Mth1)" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--ink-muted)]">NI number · category</dt>
            <dd className="font-num font-semibold">
              {line.ni_number ?? "—"} · {line.ni_category_used}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--ink-muted)]">Pay period</dt>
            <dd className="font-semibold">{run.pay_period}</dd>
          </div>
        </dl>

        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
              <th className="py-1.5 font-semibold">Payments</th>
              <th className="py-1.5 text-right font-semibold">This period</th>
              <th className="py-1.5 text-right font-semibold">Year to date</th>
            </tr>
          </thead>
          <tbody>
            <Row label={line.hours_worked != null ? `Basic pay (${line.hours_worked} hours)` : "Basic pay"} value={line.basic_pay ?? 0} />
            {line.absence_deduction > 0 && <Row label="Unpaid absence" value={-line.absence_deduction} />}
            {(line.statutory_breakdown ?? []).map((b) => (
              <Row key={b.type} label={`${b.payment} (${b.days} day${b.days === 1 ? "" : "s"})`} value={b.amount} />
            ))}
            {line.additions > 0 && <Row label="Bonus / additions" value={line.additions} />}
            {line.salary_sacrifice > 0 && <Row label="Pension salary sacrifice" value={-line.salary_sacrifice} />}
            <Row label="Gross pay" value={line.gross_pay ?? 0} ytd={ytd?.gross} strong />
          </tbody>
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
              <th className="pb-1.5 pt-4 font-semibold">Deductions</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            <Row label="Income tax (PAYE)" value={line.income_tax ?? 0} ytd={ytd?.tax} />
            <Row label="National Insurance" value={line.employee_ni ?? 0} ytd={ytd?.ni} />
            {(line.employee_pension ?? 0) > 0 && <Row label="Pension" value={line.employee_pension ?? 0} ytd={ytd?.pension} />}
            {(line.student_loan ?? 0) > 0 && <Row label="Student loan" value={line.student_loan ?? 0} />}
            {(line.postgrad_loan ?? 0) > 0 && <Row label="Postgraduate loan" value={line.postgrad_loan ?? 0} />}
            <Row
              label="Total deductions"
              value={(line.income_tax ?? 0) + (line.employee_ni ?? 0) + (line.employee_pension ?? 0) + loans}
              strong
            />
          </tbody>
        </table>

        <div className="mt-5 flex items-center justify-between rounded-[10px] bg-[var(--accent-soft)] px-4 py-3">
          <span className="text-[13px] font-semibold text-[var(--accent-strong)]">Net pay</span>
          <span className="font-num font-display text-[22px] font-semibold text-[var(--accent-strong)]">{gbp(line.net_pay)}</span>
        </div>

        <div className="mt-4 text-[11.5px] text-[var(--ink-muted)]">
          Employer contributions (not deducted from your pay): National Insurance {gbp(line.employer_ni ?? 0)} · Pension{" "}
          {gbp(line.employer_pension ?? 0)}
          {line.payrolled_benefits > 0 && ` · Taxable benefits in kind included in tax: ${gbp(line.payrolled_benefits)}`}
          {run.status === "open" && " · DRAFT — this payslip may still change before payroll is approved."}
        </div>
      </article>
    </div>
  );
}
