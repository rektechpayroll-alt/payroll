import Link from "next/link";
import { EpsPanel } from "@/components/EpsPanel";
import { RtiSubmissionList } from "@/components/RtiSubmissionList";
import { gbp } from "@/lib/format";
import { taxPeriodFor } from "@/lib/payroll/engine";
import { taxYearFor } from "@/lib/payroll/rates";
import { getPayrollSettings } from "@/lib/payroll/records";
import { listRtiSubmissions, prepareEps, RtiError } from "@/lib/rti/submissions";
import { rtiEnvironment } from "@/lib/rti/transport";

export const dynamic = "force-dynamic";

export default async function HmrcPage() {
  const today = new Date().toISOString().slice(0, 10);
  let taxYear = "2026-27";
  let month = 1;
  try {
    const params = taxYearFor(today);
    taxYear = params.label;
    month = taxPeriodFor(params, "monthly", today).number;
  } catch {
    // Outside configured tax years — fall back to the first one we support.
  }
  const settings = await getPayrollSettings();
  const env = rtiEnvironment();
  let blocked: string | null = null;
  let preview: Awaited<ReturnType<typeof prepareEps>> | null = null;
  try {
    preview = await prepareEps(taxYear, month);
  } catch (e) {
    if (!(e instanceof RtiError)) throw e;
    blocked = e.message;
  }
  if (!blocked && !env.vendorId) blocked = "Filing opens once Verity is registered with HMRC (vendor ID pending) — you can download the XML meanwhile.";
  const submissions = await listRtiSubmissions();

  return (
    <div>
      <div className="mb-[18px]">
        <Link href="/dashboard/payroll" className="text-[12px] font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]">
          ← Pay runs
        </Link>
        <h1 className="mt-1 font-display text-[26px] font-semibold">HMRC filing</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          Real Time Information, filed straight from Verity to HMRC&rsquo;s {env.name} service · PAYE ref {settings.paye_reference ?? "not set"}
        </div>
      </div>

      <section className="mb-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="border-b border-[var(--border)] px-[18px] py-[15px]">
          <h2 className="font-display text-[14.5px] font-semibold">Employer Payment Summary (EPS)</h2>
          <div className="mt-0.5 text-xs text-[var(--ink-muted)]">
            Send by the 19th after the tax month ends to claim Employment Allowance, recover statutory pay, or tell HMRC nobody was paid.
          </div>
        </div>
        <div className="flex flex-col gap-3 px-[18px] py-4">
          {preview && (
            <div className="grid grid-cols-2 gap-3 text-[12.5px] md:grid-cols-4">
              <div>
                <div className="text-[var(--ink-muted)]">Employment Allowance</div>
                <div className="font-semibold">{settings.claim_employment_allowance ? "Claimed" : "Not claimed"}</div>
              </div>
              {Object.entries(preview.totals)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[var(--ink-muted)]">{k} paid this year</div>
                    <div className="font-num font-semibold">{gbp(v)}</div>
                  </div>
                ))}
            </div>
          )}
          <EpsPanel taxYear={taxYear} defaultMonth={month} blocked={blocked} />
        </div>
      </section>

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="border-b border-[var(--border)] px-[18px] py-[15px]">
          <h2 className="font-display text-[14.5px] font-semibold">Submission history</h2>
        </div>
        <div className="px-[18px] py-3">
          <RtiSubmissionList submissions={submissions} />
        </div>
      </section>
    </div>
  );
}
