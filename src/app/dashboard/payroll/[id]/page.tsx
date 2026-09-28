import Link from "next/link";
import { notFound } from "next/navigation";
import { PayRunActions } from "@/components/PayRunActions";
import { PayRunTable } from "@/components/PayRunTable";
import { StatRow, StatTile, MetaRow } from "@/components/StatTile";
import { gbp } from "@/lib/format";
import { FREQUENCY_LABELS } from "@/lib/payroll/engine";
import { getPayrollSettings } from "@/lib/payroll/records";
import { getPayRun, getPayslipLines } from "@/lib/payroll/runs";
import { RtiSubmitForm } from "@/components/RtiSubmitForm";
import { RtiSubmissionList } from "@/components/RtiSubmissionList";
import { listRtiSubmissions, prepareFps, RtiError } from "@/lib/rti/submissions";
import { rtiEnvironment } from "@/lib/rti/transport";

export const dynamic = "force-dynamic";

export default async function PayRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getPayRun(id);
  if (!run || run.source !== "engine") notFound();
  const lines = await getPayslipLines(id);
  const open = run.status === "open";
  const blocking = lines.filter((l) => l.severity === "critical").length;
  const settings = await getPayrollSettings();
  let fpsProblems: string[] = [];
  let fpsBlocked: string | null = null;
  if (!open) {
    try {
      fpsProblems = (await prepareFps(run.id)).problems;
    } catch (e) {
      if (!(e instanceof RtiError)) throw e;
      fpsBlocked = e.message;
    }
  }
  const submissions = open ? [] : await listRtiSubmissions(run.id);
  const env = rtiEnvironment();
  const unpaid = lines.filter((l) => l.net_pay > 0 && (!l.bank_sort_code || !l.bank_account_number)).map((l) => l.employee_name);

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/payroll" className="text-[12px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
            ← Pay runs
          </Link>
          <h1 className="mt-1 font-display text-[26px] font-semibold">{run.period_label}</h1>
          <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
            {run.frequency && FREQUENCY_LABELS[run.frequency]} · {run.pay_period} · payday{" "}
            <span className="font-num text-[var(--ink)]">{run.pay_date}</span> · tax year {run.tax_year}, period {run.tax_period} ·{" "}
            {open ? "draft — editable" : "approved and locked"}
          </div>
        </div>
        {open ? (
          <PayRunActions runId={run.id} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/payroll/runs/${run.id}/payments?format=csv`}
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)]"
            >
              Download payments (CSV)
            </a>
            {settings.bacs_sun && (
              <a
                href={`/api/payroll/runs/${run.id}/payments?format=std18`}
                className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)]"
              >
                BACS Standard 18
              </a>
            )}
          </div>
        )}
      </div>

      <StatRow>
        <StatTile label="Net pay to employees" value={gbp(run.net_pay)} meta={<div>{lines.length} payslips</div>} />
        <StatTile
          label="Due to HMRC"
          value={gbp(
            run.total_tax + run.total_employee_ni + run.employer_ni + run.total_student_loan - run.employment_allowance_used - run.statutory_recovered
          )}
          meta={
            <>
              <MetaRow label="PAYE" value={gbp(run.total_tax)} />
              <MetaRow label="NI (employee + employer)" value={gbp(run.total_employee_ni + run.employer_ni)} />
              <MetaRow label="Student loans" value={gbp(run.total_student_loan)} />
              {run.employment_allowance_used > 0 && <MetaRow label="Employment Allowance" value={`−${gbp(run.employment_allowance_used)}`} />}
              {run.statutory_recovered > 0 && <MetaRow label="Statutory pay recovered" value={`−${gbp(run.statutory_recovered)}`} />}
            </>
          }
        />
        <StatTile
          label="Due to pension provider"
          value={gbp(run.total_employee_pension + run.employer_pension)}
          meta={
            <>
              <MetaRow label="Employee" value={gbp(run.total_employee_pension)} />
              <MetaRow label="Employer" value={gbp(run.employer_pension)} />
            </>
          }
        />
      </StatRow>

      {!open && unpaid.length > 0 && (
        <div className="mb-4 rounded-[10px] bg-[var(--warning-soft)] px-4 py-3 text-[12.5px] text-[var(--warning-ink)]">
          No bank details for {unpaid.join(", ")} — they&rsquo;re left out of the payment file. Pay them another way, or add their details
          for next time. Payment file layouts differ between banks: check yours accepts this format before uploading.
        </div>
      )}

      {open && (
        <div className="mb-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[12.5px] text-[var(--ink-secondary)]">
          {blocking > 0
            ? `${blocking} payslip${blocking === 1 ? "" : "s"} can't be paid until fixed. Update their pay details, then recalculate. `
            : "Everything calculates cleanly. "}
          Review and approve this run on the{" "}
          <Link href="/dashboard" className="font-semibold text-[var(--accent-strong)]">
            dashboard
          </Link>{" "}
          — approving locks the payslips and posts the journal to Verity Ledger.
        </div>
      )}

      {!open && (
        <section className="mb-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-[18px] py-[15px]">
            <div>
              <h2 className="font-display text-[14.5px] font-semibold">HMRC — Full Payment Submission</h2>
              <div className="mt-0.5 text-xs text-[var(--ink-muted)]">
                File this run with HMRC on or before payday. Sending to HMRC&rsquo;s {env.name === "live" ? "live" : "test"} service.
              </div>
            </div>
            {!fpsBlocked && (
              <a href={`/api/rti/fps/xml?runId=${run.id}`} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)]">
                Download FPS XML
              </a>
            )}
          </div>
          <div className="flex flex-col gap-3 px-[18px] py-4">
            {fpsProblems.length > 0 && (
              <ul className="list-disc pl-5 text-[12.5px] text-[var(--critical-ink)]">
                {fpsProblems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <RtiSubmitForm
              endpoint="/api/rti/fps/submit"
              payload={{ runId: run.id }}
              label="Submit FPS to HMRC"
              disabled={
                fpsBlocked ??
                (fpsProblems.length ? "Fix the items above, then file." : !env.vendorId ? "Filing opens once Verity is registered with HMRC (vendor ID pending) — you can download the XML meanwhile." : null)
              }
            />
            <RtiSubmissionList submissions={submissions} />
          </div>
        </section>
      )}

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <PayRunTable runId={run.id} lines={lines} editable={open} />
      </section>
    </div>
  );
}
